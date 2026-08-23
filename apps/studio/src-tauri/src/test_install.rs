//! The Test action (plan §6.5): install one item for real — the checkout's own
//! CLI, the real handler, the local registry content, no mocks — into a scratch
//! directory the host creates and removes again. The webview gets the command
//! line, the process outcome and every file the install wrote.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::executor::{self, OutputEvent, Registry, RunOutcome, RunRequest};
use crate::source::{self, SourceFiles};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestInstallRequest {
    pub task_id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub slug: String,
    pub timeout_ms: u64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TestInstallOutcome {
    pub command: Vec<String>,
    pub scratch_dir: String,
    pub run: RunOutcome,
    /// Everything the install wrote under the scratch directory.
    pub files: SourceFiles,
    /// Set when the scratch directory could not be removed afterwards.
    pub cleanup_error: Option<String>,
}

const TYPES: [&str; 7] = ["skill", "plugin", "hook", "agent", "mcp", "settings", "command"];

/// Mirrors registry-ops' `SLUG_PATTERN`; a slug travels on argv, so nothing flag-like passes.
fn is_slug(value: &str) -> bool {
    let mut chars = value.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'))
}

static COUNTER: AtomicU64 = AtomicU64::new(0);

fn scratch_dir() -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join(format!(
        "seedr-studio-test-{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::SeqCst)
    ));
    fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}

/// The checkout's CLI through the checkout's own `tsx`, so the run needs no global tools.
pub fn command(root: &Path, item_type: &str, slug: &str) -> Result<Vec<String>, String> {
    if !TYPES.contains(&item_type) {
        return Err(format!("unknown type \"{item_type}\""));
    }
    if !is_slug(slug) {
        return Err(format!("invalid slug \"{slug}\""));
    }
    let tsx = root.join("node_modules").join("tsx").join("dist").join("cli.mjs");
    if !tsx.is_file() {
        return Err(format!("{}: not found — run `pnpm install` in the checkout first", tsx.display()));
    }
    let cli = root.join("packages").join("cli").join("src").join("cli.ts");
    if !cli.is_file() {
        return Err(format!("{}: not found", cli.display()));
    }
    let mut command = vec!["node".to_string(), tsx.display().to_string(), cli.display().to_string()];
    command.extend(["add", slug, "--type", item_type, "--agents", "all", "--scope", "project", "--method", "copy", "--yes"].map(String::from));
    Ok(command)
}

pub fn run(registry: &Registry, root: &Path, request: TestInstallRequest, sink: Arc<dyn Fn(OutputEvent) + Send + Sync>) -> Result<TestInstallOutcome, String> {
    let command = command(root, &request.item_type, &request.slug)?;
    let dir = scratch_dir()?;
    let run = executor::run(
        registry,
        RunRequest {
            task_id: request.task_id,
            program: command[0].clone(),
            args: command[1..].to_vec(),
            stdin: None,
            cwd: Some(dir.clone()),
            timeout_ms: request.timeout_ms,
        },
        sink,
    );
    let files = source::read_source_files(&dir);
    let cleanup_error = fs::remove_dir_all(&dir).err().map(|e| format!("{}: {e}", dir.display()));
    Ok(TestInstallOutcome { command, scratch_dir: dir.display().to_string(), run, files: files?, cleanup_error })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executor::RunStatus;

    fn checkout() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..")
    }

    fn quiet() -> Arc<dyn Fn(OutputEvent) + Send + Sync> {
        Arc::new(|_| {})
    }

    #[test]
    fn refuses_flag_like_slugs_and_unknown_types() {
        let root = checkout();
        assert!(command(&root, "skill", "--force").unwrap_err().contains("invalid slug"));
        assert!(command(&root, "skill", "../x").unwrap_err().contains("invalid slug"));
        assert!(command(&root, "widget", "pdf").unwrap_err().contains("unknown type"));
    }

    #[test]
    fn names_the_checkouts_own_tsx_and_cli() {
        let root = checkout();
        if !root.join("node_modules").join("tsx").is_dir() {
            eprintln!("skipped: no node_modules in the checkout");
            return;
        }
        let command = command(&root, "skill", "my-skill").expect("command");
        assert_eq!(command[0], "node");
        assert!(command[1].ends_with("cli.mjs"));
        assert!(command[2].ends_with("cli.ts"));
        assert_eq!(&command[3..], ["add", "my-skill", "--type", "skill", "--agents", "all", "--scope", "project", "--method", "copy", "--yes"]);
    }

    /// A first-party skill from this checkout's registry, if it has one.
    fn local_skill(root: &Path) -> Option<String> {
        let skills = fs::read_dir(root.join("registry").join("skills")).ok()?;
        let mut names: Vec<_> = skills.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        names.into_iter().find(|name| {
            fs::read_to_string(root.join("registry").join("skills").join(name).join("item.json"))
                .ok()
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
                .is_some_and(|item| item["sourceType"] == "toolr")
        })
    }

    #[test]
    fn installs_a_local_skill_into_a_scratch_dir_and_removes_it() {
        let root = checkout();
        if !root.join("node_modules").join("tsx").is_dir() {
            eprintln!("skipped: no node_modules in the checkout");
            return;
        }
        let Some(slug) = local_skill(&root) else {
            eprintln!("skipped: the registry has no first-party skill");
            return;
        };
        let request = TestInstallRequest { task_id: "test-install".into(), item_type: "skill".into(), slug: slug.clone(), timeout_ms: 120_000 };
        let outcome = run(&Registry::default(), &root, request, quiet()).expect("run");

        assert_eq!(outcome.run.status, RunStatus::Ok, "stdout: {}\nstderr: {}", outcome.run.stdout, outcome.run.stderr);
        assert_eq!(outcome.cleanup_error, None);
        assert!(!Path::new(&outcome.scratch_dir).exists(), "scratch dir was not removed");
        let skill_md = format!("skills/{slug}/SKILL.md");
        let written: Vec<_> = outcome.files.files.keys().collect();
        assert!(written.iter().any(|rel| rel.ends_with(&skill_md)), "no SKILL.md among {written:?}");
    }
}

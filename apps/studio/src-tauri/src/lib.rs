//! Seedr Studio host.
//!
//! Everything the webview can ask for is read-only filesystem access, scoped to
//! the repository the user chose, plus a watcher and "open with the default
//! app". Every path crosses the IPC boundary *relative to the repo root* and is
//! checked against it after canonicalisation, so a path that escapes the root —
//! by `..`, by being absolute, or through a symlink — is refused. Registry
//! semantics (what an item is, whether it is valid) never live here.

mod executor;
mod source;
mod test_install;

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use executor::{OutputEvent, Registry, RunOutcome, RunRequest};
use source::{PickedPaths, SourceFiles};
use test_install::{TestInstallOutcome, TestInstallRequest};

/// Files larger than this are opened externally instead of read into the webview.
const MAX_TEXT_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Default)]
struct Repo(Mutex<Option<PathBuf>>);

#[derive(Default)]
struct RegistryWatcher(Mutex<Option<RecommendedWatcher>>);

#[derive(Serialize, Clone, Debug)]
struct RepoInfo {
    root: String,
    name: String,
}

#[derive(Serialize)]
struct DirEntry {
    name: String,
    kind: &'static str,
}

fn current_root(repo: &State<Repo>) -> Result<PathBuf, String> {
    repo.0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No repository selected".to_string())
}

/// A repo-relative path that cannot leave the root: relative, no `..`, and —
/// once it exists — canonicalising inside the canonical root.
fn scoped(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() || rel_path.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err(format!("{rel}: paths must be relative to the repository and may not contain '..'"));
    }
    let joined = root.join(rel_path);
    if !joined.exists() {
        return Ok(joined);
    }
    let canonical_root = root.canonicalize().map_err(|e| format!("repository root: {e}"))?;
    let canonical = joined.canonicalize().map_err(|e| format!("{rel}: {e}"))?;
    if !canonical.starts_with(&canonical_root) {
        return Err(format!("{rel}: escapes the repository"));
    }
    Ok(canonical)
}

/// What makes a folder a seedr registry checkout Studio can work on.
fn repo_info(path: &Path) -> Result<RepoInfo, String> {
    if !path.is_dir() {
        return Err(format!("{}: not a directory", path.display()));
    }
    if !path.join("registry").is_dir() {
        return Err("Not a seedr registry: no registry/ directory".to_string());
    }
    if !path.join("scripts").join("registry-op.ts").is_file() {
        return Err("Not a seedr checkout: scripts/registry-op.ts is missing".to_string());
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    Ok(RepoInfo { root: path.display().to_string(), name })
}


#[tauri::command]
async fn pick_repo(app: AppHandle, repo: State<'_, Repo>) -> Result<Option<RepoInfo>, String> {
    let Some(picked) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let info = repo_info(&path)?;
    *repo.0.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(Some(info))
}

#[tauri::command]
fn get_repo(repo: State<Repo>) -> Result<Option<RepoInfo>, String> {
    let root = repo.0.lock().map_err(|e| e.to_string())?.clone();
    root.map(|path| repo_info(&path)).transpose()
}

#[tauri::command]
fn list_dir(rel: String, repo: State<Repo>) -> Result<Vec<DirEntry>, String> {
    let dir = scoped(&current_root(&repo)?, &rel)?;
    let entries = fs::read_dir(&dir).map_err(|e| format!("{rel}: {e}"))?;
    let mut out = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("{rel}: {e}"))?;
        let file_type = entry.file_type().map_err(|e| format!("{rel}: {e}"))?;
        // Follow links so `.claude/rules -> ../.agents/rules` reads as a directory.
        let kind = if file_type.is_symlink() {
            match fs::metadata(entry.path()) {
                Ok(meta) if meta.is_dir() => "directory",
                Ok(meta) if meta.is_file() => "file",
                _ => "other",
            }
        } else if file_type.is_dir() {
            "directory"
        } else if file_type.is_file() {
            "file"
        } else {
            "other"
        };
        out.push(DirEntry { name: entry.file_name().to_string_lossy().into_owned(), kind });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
fn read_text(rel: String, repo: State<Repo>) -> Result<String, String> {
    let file = scoped(&current_root(&repo)?, &rel)?;
    let meta = fs::metadata(&file).map_err(|e| format!("{rel}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("{rel}: not a file"));
    }
    if meta.len() > MAX_TEXT_BYTES {
        return Err(format!("{rel}: too large to show here ({} bytes) — open it with the default app", meta.len()));
    }
    fs::read_to_string(&file).map_err(|e| format!("{rel}: {e}"))
}

#[tauri::command]
fn path_exists(rel: String, repo: State<Repo>) -> Result<bool, String> {
    Ok(scoped(&current_root(&repo)?, &rel)?.exists())
}

#[tauri::command]
fn open_path(rel: String, repo: State<Repo>) -> Result<(), String> {
    let path = scoped(&current_root(&repo)?, &rel)?;
    if !path.exists() {
        return Err(format!("{rel}: does not exist"));
    }
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// The schemes a registry item may send to the system browser. Item metadata is
/// third-party input, so the gate sits here rather than in the renderer:
/// `javascript:`, `file:` and `data:` never reach the shell however they were
/// spelled (the webview shows a confirmation dialog first; this is the backstop).
fn safe_external_url(raw: &str) -> Option<url::Url> {
    let parsed = url::Url::parse(raw).ok()?;
    matches!(parsed.scheme(), "http" | "https" | "mailto").then_some(parsed)
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let parsed = safe_external_url(&url).ok_or_else(|| format!("{url}: not a link this app opens"))?;
    tauri_plugin_opener::open_url(parsed.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Watch `registry/` recursively and emit `registry-changed` on every event;
/// the webview coalesces bursts. Calling it again replaces the watcher.
#[tauri::command]
fn watch_registry(app: AppHandle, repo: State<Repo>, watcher: State<RegistryWatcher>) -> Result<(), String> {
    let registry = current_root(&repo)?.join("registry");
    let handle = app.clone();
    let mut new_watcher = notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
        if event.is_ok() {
            let _ = handle.emit("registry-changed", ());
        }
    })
    .map_err(|e| e.to_string())?;
    new_watcher.watch(&registry, RecursiveMode::Recursive).map_err(|e| format!("watch {}: {e}", registry.display()))?;
    *watcher.0.lock().map_err(|e| e.to_string())? = Some(new_watcher);
    Ok(())
}

/// Everything the webview may run: the registry CLI (`npx`), the probed coding
/// agent, and read-only `git`. A compromised webview must not become a shell.
const RUNNABLE_PROGRAMS: [&str; 3] = ["npx", "claude", "git"];

/// Run a bounded child process with its working directory inside the repo.
/// Output lines stream to the webview as `process-output` events.
#[tauri::command]
async fn run_process(app: AppHandle, mut request: RunRequest, repo: State<'_, Repo>, registry: State<'_, Registry>) -> Result<RunOutcome, String> {
    let root = current_root(&repo)?;
    if !RUNNABLE_PROGRAMS.contains(&request.program.as_str()) {
        return Err(format!("{}: not a program Studio runs", request.program));
    }
    request.cwd = Some(match request.cwd.as_deref().and_then(|p| p.to_str()) {
        Some(rel) if !rel.is_empty() => scoped(&root, rel)?,
        _ => root,
    });
    let sink: Arc<dyn Fn(OutputEvent) + Send + Sync> = Arc::new(move |event| {
        let _ = app.emit("process-output", event);
    });
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || executor::run(&registry, request, sink)).await.map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_process(task_id: String, registry: State<Registry>) -> bool {
    // Marked before the kill so the dying run reads its flag, unmarked again when
    // nothing was running — a stale flag would label the task's NEXT run cancelled.
    executor::mark_cancelled(&task_id);
    let cancelled = registry.cancel(&task_id);
    if !cancelled {
        executor::clear_cancel_flag(&task_id);
    }
    cancelled
}

/// A native picker; the chosen absolute path is remembered so `read_source_files` may read under it.
#[tauri::command]
async fn pick_path(kind: String, app: AppHandle, picked: State<'_, PickedPaths>) -> Result<Option<String>, String> {
    let dialog = app.dialog().file();
    let chosen = if kind == "file" { dialog.blocking_pick_file() } else { dialog.blocking_pick_folder() };
    let Some(chosen) = chosen else { return Ok(None) };
    let path = chosen.into_path().map_err(|e| e.to_string())?;
    picked.remember(&path);
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
fn read_source_files(path: String, picked: State<PickedPaths>) -> Result<SourceFiles, String> {
    // Canonical first: `<picked>/../elsewhere` shares the prefix but not the tree.
    let path = PathBuf::from(&path).canonicalize().map_err(|e| format!("{path}: {e}"))?;
    if !picked.allows(&path) {
        return Err("Only paths chosen through the picker in this session can be read".to_string());
    }
    source::read_source_files(&path)
}

/// Install one item for real with the checkout's CLI into a scratch directory
/// the host creates and removes; see `test_install`.
#[tauri::command]
async fn test_install(app: AppHandle, request: TestInstallRequest, repo: State<'_, Repo>, registry: State<'_, Registry>) -> Result<TestInstallOutcome, String> {
    let root = current_root(&repo)?;
    let sink: Arc<dyn Fn(OutputEvent) + Send + Sync> = Arc::new(move |event| {
        let _ = app.emit("process-output", event);
    });
    let registry = registry.inner().clone();
    tauri::async_runtime::spawn_blocking(move || test_install::run(&registry, &root, request, sink)).await.map_err(|e| e.to_string())?
}

/// `SEEDR_STUDIO_REPO=<path>` launches straight into that checkout (it still has
/// to pass `repo_info`); otherwise the first screen asks for one.
fn preselected_repo() -> Repo {
    let picked = std::env::var_os("SEEDR_STUDIO_REPO").map(PathBuf::from).filter(|path| match repo_info(path) {
        Ok(_) => true,
        Err(reason) => {
            eprintln!("SEEDR_STUDIO_REPO ignored: {reason}");
            false
        }
    });
    Repo(Mutex::new(picked))
}

pub fn run() {
    executor::enrich_path();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(preselected_repo())
        .manage(RegistryWatcher::default())
        .manage(Registry::default())
        .manage(PickedPaths::default())
        .invoke_handler(tauri::generate_handler![
            pick_repo,
            get_repo,
            list_dir,
            read_text,
            path_exists,
            open_path,
            open_external,
            watch_registry,
            run_process,
            cancel_process,
            pick_path,
            read_source_files,
            test_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running Seedr Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// One directory per test: cargo runs tests in parallel, so a shared fixture races.
    fn temp_root(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("seedr-studio-{}-{tag}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("registry").join("skills").join("pdf")).expect("fixture");
        fs::create_dir_all(dir.join("scripts")).expect("fixture");
        fs::write(dir.join("scripts").join("registry-op.ts"), "").expect("fixture");
        fs::write(dir.join("registry").join("skills").join("pdf").join("item.json"), "{}").expect("fixture");
        dir
    }

    #[test]
    fn scoped_accepts_relative_paths_inside_the_root() {
        let root = temp_root("inside");
        let path = scoped(&root, "registry/skills/pdf/item.json").expect("inside");
        assert!(path.ends_with("item.json"));
        assert!(scoped(&root, "registry/not-yet-there").is_ok(), "a missing path is allowed so exists() can answer");
    }

    #[test]
    fn external_urls_pass_only_on_scheme_and_never_on_spelling() {
        assert!(safe_external_url("https://github.com/x").is_some());
        assert!(safe_external_url("mailto:a@b.c").is_some());
        assert!(safe_external_url("javascript:alert(1)").is_none());
        assert!(safe_external_url("JaVaScRiPt:alert(1)").is_none());
        assert!(safe_external_url("file:///etc/passwd").is_none());
        assert!(safe_external_url("data:text/html,x").is_none());
        assert!(safe_external_url("not a url").is_none());
    }

    #[test]
    fn scoped_refuses_absolute_and_parent_paths() {
        let root = temp_root("parent");
        assert!(scoped(&root, "/etc/passwd").is_err());
        assert!(scoped(&root, "../outside").is_err());
        assert!(scoped(&root, "registry/../../outside").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn scoped_refuses_a_symlink_that_leaves_the_root() {
        let root = temp_root("symlink");
        let link = root.join("escape");
        let _ = fs::remove_file(&link);
        std::os::unix::fs::symlink("/", &link).expect("symlink");
        assert!(scoped(&root, "escape").is_err());
    }

    #[test]
    fn repo_info_requires_a_registry_and_the_ops_cli() {
        let root = temp_root("repo-info");
        assert_eq!(repo_info(&root).expect("valid").name, root.file_name().expect("name").to_string_lossy());
        fs::remove_file(root.join("scripts").join("registry-op.ts")).expect("remove");
        assert!(repo_info(&root).unwrap_err().contains("registry-op.ts"));
        assert!(repo_info(&root.join("registry").join("skills")).unwrap_err().contains("no registry/"));
    }
}

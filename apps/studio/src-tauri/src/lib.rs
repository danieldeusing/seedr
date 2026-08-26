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

use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

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
#[serde(rename_all = "camelCase")]
struct RepoInfo {
    root: String,
    name: String,
    /// Whether this is the checkout Studio calls home. False is the interesting
    /// case: the title bar warns, because changing the wrong registry by
    /// accident is the mistake this app can make.
    is_default: bool,
    /// Whether `scripts/registry-op.ts` is here. Without it the registry can be
    /// read but not changed, and the actions that would change it say so.
    has_ops: bool,
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
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.display().to_string());
    // A registry without the operations CLI is still worth opening — it can be
    // read, searched and previewed. What it cannot do is change anything, since
    // every mutation goes through that script as a transaction, so this is a
    // capability the webview reports rather than a reason to refuse the folder.
    let has_ops = path.join("scripts").join("registry-op.ts").is_file();
    Ok(RepoInfo { root: path.display().to_string(), name, is_default: is_default_repo(path), has_ops })
}


/// Where the chosen checkout is remembered between launches: one line, one path.
fn remembered_repo_file() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("seedr-studio").join("repo"))
}

/// One path, one line. Writing is best effort — a read-only config directory must
/// not stop the app from opening the repository the user just picked.
fn write_repo_path(file: &Path, path: &Path) {
    if let Some(parent) = file.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(file, path.display().to_string());
}

/// The remembered checkout, if it is still one. A moved or deleted folder is
/// simply forgotten, so the next launch asks instead of failing.
fn remembered_repo_at(file: &Path) -> Option<PathBuf> {
    let path = PathBuf::from(fs::read_to_string(file).ok()?.trim());
    repo_info(&path).ok().map(|_| path)
}

/// Where the *default* checkout is recorded — a second file beside the
/// remembered one, and a different question: not "which one do I reopen?" but
/// "which one am I normally in?".
fn default_repo_file() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("seedr-studio").join("default"))
}

/// The recorded default, whether or not that folder is still a checkout: a
/// default that has moved away makes the current one *not* it, which is exactly
/// what the user should be told.
fn default_repo_at(file: &Path) -> Option<PathBuf> {
    let recorded = fs::read_to_string(file).ok()?;
    let line = recorded.trim();
    (!line.is_empty()).then(|| PathBuf::from(line))
}

/// The first checkout wins. A plain switch must not move the baseline it is
/// being measured against, or the alert would never fire.
fn adopt_default_repo_at(file: &Path, path: &Path) {
    if default_repo_at(file).is_none() {
        write_repo_path(file, path);
    }
}

/// The comparison the webview is spared: it never learns which path is the
/// default, only whether the one it has open is it.
fn is_default_repo(path: &Path) -> bool {
    match default_repo_file().as_deref().and_then(default_repo_at) {
        Some(default) => default == path,
        // Nothing recorded yet — a first run is home, not something to warn about.
        None => true,
    }
}

/// The file picker, owned by the app window. With no parent set, rfd falls back
/// to whatever `NSApp` reports on macOS and runs the panel as a sheet on that
/// window; when the guess is not the window the user clicked in, no dialog is
/// ever shown and the click looks like it did nothing at all.
fn parented_file_dialog(app: &AppHandle) -> FileDialogBuilder<tauri::Wry> {
    let dialog = app.dialog().file();
    match app.get_webview_window("main") {
        Some(window) => dialog.set_parent(&window),
        None => dialog,
    }
}

#[tauri::command]
async fn pick_repo(app: AppHandle, repo: State<'_, Repo>) -> Result<Option<RepoInfo>, String> {
    let Some(picked) = parented_file_dialog(&app).blocking_pick_folder() else {
        return Ok(None);
    };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    let info = repo_info(&path)?;
    if let Some(file) = remembered_repo_file() {
        write_repo_path(&file, &path);
    }
    // Only a folder that passed as a checkout may become the default one.
    if let Some(file) = default_repo_file() {
        adopt_default_repo_at(&file, &path);
    }
    *repo.0.lock().map_err(|e| e.to_string())? = Some(path);
    Ok(Some(info))
}

/// Re-baseline: the open checkout becomes the one every other is measured
/// against. Deliberate, because it is what silences the alert.
#[tauri::command]
fn set_default_repo(path: String, repo: State<Repo>) -> Result<RepoInfo, String> {
    // Named explicitly rather than taken from the open checkout: the default is
    // set in settings, where the folder being named may not be the one open.
    let chosen = PathBuf::from(path);
    repo_info(&chosen)?;
    let file = default_repo_file().ok_or_else(|| "No configuration directory to record the default checkout in".to_string())?;
    write_repo_path(&file, &chosen);
    // The answer describes the checkout that is open, whose is_default may have
    // just changed either way.
    repo_info(&current_root(&repo)?)
}

/// The checkout Studio treats as home, if one has been recorded and is still a
/// registry. Its `has_ops` is what lets a checkout without the operations CLI
/// still be changed: the CLI runs from here, pointed at the other one.
#[tauri::command]
fn default_repo() -> Option<RepoInfo> {
    default_repo_file().as_deref().and_then(default_repo_at).and_then(|path| repo_info(&path).ok())
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

/// A skill Claude Code can be asked for by name, for the prompt fields'
/// autocomplete: this checkout's own, and the ones installed for the user.
#[derive(Serialize)]
struct SkillEntry {
    name: String,
    description: String,
    /// `project` for a skill in this checkout, `user` for one in ~/.claude.
    scope: &'static str,
}

/// The `description:` of a SKILL.md, from its YAML frontmatter. First match wins;
/// a skill without one is still listed, by name alone.
fn skill_description(text: &str) -> String {
    let mut lines = text.lines();
    if lines.next().map(str::trim) != Some("---") {
        return String::new();
    }
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(value) = trimmed.strip_prefix("description:") {
            return value.trim().trim_matches(['"', '\'']).to_string();
        }
    }
    String::new()
}

/// Every `<dir>/<name>/SKILL.md` under one skills directory. The name is a
/// directory entry, never a caller's string, so no path can be composed here.
fn skills_in(dir: &Path, scope: &'static str, out: &mut Vec<SkillEntry>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path().join("SKILL.md");
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || out.iter().any(|skill| skill.name == name) {
            continue;
        }
        let description = fs::read_to_string(&path).map(|text| skill_description(&text)).unwrap_or_default();
        out.push(SkillEntry { name, description, scope });
    }
}

/// What `claude` in this checkout could be asked for by name. The project's own
/// skills come first, so a repo skill wins over a user skill of the same name —
/// which is also how Claude Code resolves them.
#[tauri::command]
fn list_skills(repo: State<Repo>) -> Result<Vec<SkillEntry>, String> {
    let root = current_root(&repo)?;
    let mut skills = Vec::new();
    skills_in(&root.join(".agents/skills"), "project", &mut skills);
    skills_in(&root.join(".claude/skills"), "project", &mut skills);
    if let Some(home) = dirs::home_dir() {
        skills_in(&home.join(".claude/skills"), "user", &mut skills);
    }
    skills.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(skills)
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

/// Everything the webview may run: the registry CLI (`npx`), read-only `git`,
/// and the coding-agent CLIs the settings page probes. A compromised webview
/// must not become a shell.
const RUNNABLE_PROGRAMS: [&str; 7] = ["npx", "claude", "git", "copilot", "agy", "codex", "opencode"];

/// The programs a user may point at a custom binary (Settings → coding agents).
/// `npx` and `git` stay resolution-only: overriding infrastructure would be a
/// quiet way to swap what every transaction runs.
const OVERRIDABLE_PROGRAMS: [&str; 5] = ["claude", "copilot", "agy", "codex", "opencode"];

/// Custom binary paths per agent CLI, set from the settings page and applied
/// wherever the executor would otherwise resolve the bare name on PATH.
#[derive(Default)]
struct ProgramOverrides(Mutex<HashMap<String, PathBuf>>);

impl ProgramOverrides {
    fn set(&self, program: &str, path: Option<&str>) -> Result<(), String> {
        if !OVERRIDABLE_PROGRAMS.contains(&program) {
            return Err(format!("{program}: not a program with a configurable path"));
        }
        let mut map = self.0.lock().map_err(|e| e.to_string())?;
        match path {
            None | Some("") => {
                map.remove(program);
            }
            Some(path) => {
                let path = PathBuf::from(path);
                if !path.is_file() {
                    return Err(format!("{}: not a file", path.display()));
                }
                map.insert(program.to_string(), path);
            }
        }
        Ok(())
    }

    fn resolve(&self, program: &str) -> Option<PathBuf> {
        self.0.lock().ok().and_then(|map| map.get(program).cloned())
    }
}

#[tauri::command]
fn set_program_override(program: String, path: Option<String>, overrides: State<ProgramOverrides>) -> Result<(), String> {
    overrides.set(&program, path.as_deref())
}

/// Run a bounded child process with its working directory inside the repo.
/// Output lines stream to the webview as `process-output` events.
#[tauri::command]
async fn run_process(app: AppHandle, mut request: RunRequest, repo: State<'_, Repo>, registry: State<'_, Registry>, overrides: State<'_, ProgramOverrides>) -> Result<RunOutcome, String> {
    // A registry whose own tooling predates the operations CLI is changed by
    // running that CLI from the default checkout, pointed at this one. The only
    // other place a run may happen is a folder this host recorded itself.
    let root = if request.in_default_repo {
        default_repo_file()
            .as_deref()
            .and_then(default_repo_at)
            .ok_or_else(|| "No default checkout is recorded, so there is no operations CLI to run".to_string())?
    } else {
        current_root(&repo)?
    };
    if !RUNNABLE_PROGRAMS.contains(&request.program.as_str()) {
        return Err(format!("{}: not a program Studio runs", request.program));
    }
    if let Some(path) = overrides.resolve(&request.program) {
        request.program = path.display().to_string();
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

/// Answer a task that is waiting on input — a sign-in asking for a code. The
/// task id is the only handle, exactly as it is for cancelling.
#[tauri::command]
fn send_process_input(task_id: String, text: String, registry: State<Registry>) -> bool {
    registry.send_input(&task_id, &text)
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
    let dialog = parented_file_dialog(&app);
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
/// to pass `repo_info`); failing that, the one picked last time; failing that,
/// the first screen asks for one.
fn preselected_repo() -> Repo {
    let from_env = std::env::var_os("SEEDR_STUDIO_REPO").map(PathBuf::from).filter(|path| match repo_info(path) {
        Ok(_) => true,
        Err(reason) => {
            eprintln!("SEEDR_STUDIO_REPO ignored: {reason}");
            false
        }
    });
    // Whatever this launch resolved to becomes the one the next plain launch
    // opens: choosing a checkout is choosing it, however it was named.
    let selected = from_env.or_else(|| remembered_repo_file().as_deref().and_then(remembered_repo_at));
    if let (Some(file), Some(path)) = (remembered_repo_file(), selected.as_deref()) {
        write_repo_path(&file, path);
    }
    // The first checkout Studio ever opens is the one it calls home; every later
    // one is measured against it rather than replacing it.
    if let (Some(file), Some(path)) = (default_repo_file(), selected.as_deref()) {
        adopt_default_repo_at(&file, path);
    }
    Repo(Mutex::new(selected))
}

pub fn run() {
    executor::enrich_path();
    // Anything a previous run left behind when it was killed mid-install.
    test_install::sweep_scratch(&std::env::temp_dir(), std::time::SystemTime::now(), test_install::STALE_AFTER);
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(preselected_repo())
        .manage(RegistryWatcher::default())
        .manage(Registry::default())
        .manage(PickedPaths::default())
        .manage(ProgramOverrides::default())
        .invoke_handler(tauri::generate_handler![
            pick_repo,
            get_repo,
            set_default_repo,
            default_repo,
            list_dir,
            read_text,
            path_exists,
            open_path,
            open_external,
            watch_registry,
            run_process,
            cancel_process,
            send_process_input,
            set_program_override,
            list_skills,
            pick_path,
            read_source_files,
            test_install
        ])
        // The overlay title bar leaves the webview behind when the window is
        // dragged taller on macOS: the window grows, the content keeps the height
        // it had, and the difference shows as dead space along the bottom. Every
        // resize therefore restates the webview's size as the window's own.
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                if let Some(webview) = window.get_webview_window("main") {
                    let _ = webview.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: size.width, height: size.height }));
                }
            }
        })
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
    fn skills_are_read_from_their_directories_with_the_frontmatter_description() {
        let dir = std::env::temp_dir().join(format!("seedr-skills-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for (name, body) in [
            ("add-seedr", "---\nname: add-seedr\ndescription: \"Add local items\"\n---\n# body\n"),
            ("bare", "# no frontmatter\n"),
        ] {
            fs::create_dir_all(dir.join(name)).expect("fixture");
            fs::write(dir.join(name).join("SKILL.md"), body).expect("fixture");
        }
        // A directory without a SKILL.md is not a skill, and neither is a file.
        fs::create_dir_all(dir.join("not-a-skill")).expect("fixture");
        fs::write(dir.join("loose.md"), "x").expect("fixture");

        let mut skills = Vec::new();
        skills_in(&dir, "project", &mut skills);
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        assert_eq!(skills.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(), ["add-seedr", "bare"]);
        assert_eq!(skills[0].description, "Add local items");
        assert_eq!(skills[1].description, "");

        // The first directory scanned wins, the way Claude Code resolves a name.
        skills_in(&dir, "user", &mut skills);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].scope, "project");

        // A missing directory is simply no skills, never an error.
        let mut none = Vec::new();
        skills_in(&dir.join("gone"), "user", &mut none);
        assert!(none.is_empty());
        fs::remove_dir_all(&dir).expect("cleanup");
    }

    #[test]
    fn program_overrides_take_only_agent_clis_and_only_real_files() {
        let overrides = ProgramOverrides::default();
        assert!(overrides.set("git", Some("/bin/ls")).unwrap_err().contains("not a program with a configurable path"));
        assert!(overrides.set("claude", Some("/definitely/not/here")).unwrap_err().contains("not a file"));

        let file = std::env::temp_dir().join(format!("seedr-override-{}", std::process::id()));
        fs::write(&file, "#!/bin/sh\n").expect("fixture");
        overrides.set("claude", Some(file.to_str().expect("utf8"))).expect("set");
        assert_eq!(overrides.resolve("claude"), Some(file.clone()));

        overrides.set("claude", None).expect("clear");
        assert_eq!(overrides.resolve("claude"), None);
        fs::remove_file(&file).expect("cleanup");
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
    fn the_picked_repository_is_remembered_and_a_stale_one_is_forgotten() {
        let root = temp_root("remember");
        let file = std::env::temp_dir().join(format!("seedr-remember-{}", std::process::id())).join("repo");

        assert_eq!(remembered_repo_at(&file), None, "nothing remembered yet");
        write_repo_path(&file, &root);
        assert_eq!(remembered_repo_at(&file), Some(root.clone()));

        // A folder that is no longer a checkout is forgotten, not reopened.
        fs::remove_dir_all(root.join("registry")).expect("remove");
        assert_eq!(remembered_repo_at(&file), None);

        let _ = fs::remove_dir_all(file.parent().expect("parent"));
    }

    #[test]
    fn the_default_checkout_is_the_first_one_opened_until_it_is_set_again() {
        let file = std::env::temp_dir().join(format!("seedr-default-{}", std::process::id())).join("default");
        let _ = fs::remove_dir_all(file.parent().expect("parent"));

        assert_eq!(default_repo_at(&file), None, "nothing recorded yet");
        adopt_default_repo_at(&file, Path::new("/checkouts/seedr"));
        assert_eq!(default_repo_at(&file), Some(PathBuf::from("/checkouts/seedr")));

        // Switching checkouts leaves the baseline alone, which is what gives the
        // alert something to be measured against.
        adopt_default_repo_at(&file, Path::new("/checkouts/fork"));
        assert_eq!(default_repo_at(&file), Some(PathBuf::from("/checkouts/seedr")));

        // Re-baselining is the explicit action, and it overwrites.
        write_repo_path(&file, Path::new("/checkouts/fork"));
        assert_eq!(default_repo_at(&file), Some(PathBuf::from("/checkouts/fork")));

        // A blank file records nothing — it must not read as the root directory.
        write_repo_path(&file, Path::new(""));
        assert_eq!(default_repo_at(&file), None);

        let _ = fs::remove_dir_all(file.parent().expect("parent"));
    }

    #[test]
    fn repo_info_requires_a_registry_and_reports_whether_it_can_be_changed() {
        let root = temp_root("repo-info");
        let full = repo_info(&root).expect("valid");
        assert_eq!(full.name, root.file_name().expect("name").to_string_lossy());
        assert!(full.has_ops);

        // A registry-only checkout opens; it just cannot be changed from here.
        fs::remove_file(root.join("scripts").join("registry-op.ts")).expect("remove");
        assert!(!repo_info(&root).expect("still a registry").has_ops);

        // Without a registry at all there is nothing to show.
        assert!(repo_info(&root.join("registry").join("skills")).unwrap_err().contains("no registry/"));
    }
}

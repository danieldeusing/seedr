//! Reading a capability's source files for the metadata draft — the one place
//! Studio reads outside the repository, limited to paths the user picked with
//! the native dialog in this session, and bounded in count and bytes.

use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

const MAX_FILES: usize = 200;
const MAX_FILE_BYTES: u64 = 256 * 1024;
const MAX_TOTAL_BYTES: usize = 2 * 1024 * 1024;
const SKIPPED_DIRS: [&str; 4] = [".git", "node_modules", "target", "dist"];

/// Absolute paths the dialog handed out; `read_source_files` accepts nothing else.
#[derive(Default)]
pub struct PickedPaths(Mutex<HashSet<PathBuf>>);

impl PickedPaths {
    pub fn remember(&self, path: &Path) {
        if let Ok(mut set) = self.0.lock() {
            set.insert(path.to_path_buf());
        }
    }

    pub fn allows(&self, path: &Path) -> bool {
        self.0.lock().map(|set| set.iter().any(|picked| path.starts_with(picked))).unwrap_or(false)
    }
}

#[derive(Serialize, Debug, Default)]
pub struct SourceFiles {
    pub files: BTreeMap<String, String>,
    pub skipped: Vec<String>,
}

/// Text files under `root` (or `root` itself when it is a file), relative paths with forward slashes.
pub fn read_source_files(root: &Path) -> Result<SourceFiles, String> {
    let meta = fs::metadata(root).map_err(|e| format!("{}: {e}", root.display()))?;
    let mut out = SourceFiles::default();
    let mut total = 0usize;
    if meta.is_file() {
        let name = root.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        consider(root, name, &mut out, &mut total);
        return Ok(out);
    }
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if path.is_dir() {
                if !SKIPPED_DIRS.contains(&name.as_str()) {
                    stack.push(path);
                }
                continue;
            }
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if out.files.len() >= MAX_FILES {
                out.skipped.push(rel);
                continue;
            }
            consider(&path, rel, &mut out, &mut total);
        }
    }
    Ok(out)
}

fn consider(path: &Path, rel: String, out: &mut SourceFiles, total: &mut usize) {
    let Ok(meta) = fs::metadata(path) else { return };
    if meta.len() > MAX_FILE_BYTES || *total + meta.len() as usize > MAX_TOTAL_BYTES {
        out.skipped.push(rel);
        return;
    }
    match fs::read(path).ok().and_then(|bytes| String::from_utf8(bytes).ok()) {
        Some(text) => {
            *total += text.len();
            out.files.insert(rel, text);
        }
        None => out.skipped.push(rel),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_files_recursively_and_skips_binaries_and_noise_dirs() {
        let root = std::env::temp_dir().join(format!("seedr-source-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("scripts")).expect("fixture");
        fs::create_dir_all(root.join("node_modules").join("x")).expect("fixture");
        fs::write(root.join("SKILL.md"), "# skill\n").expect("fixture");
        fs::write(root.join("scripts").join("run.py"), "print(1)\n").expect("fixture");
        fs::write(root.join("node_modules").join("x").join("index.js"), "noise").expect("fixture");
        fs::write(root.join("image.png"), [0xff, 0xd8, 0x00, 0x80, 0xfe]).expect("fixture");

        let result = read_source_files(&root).expect("read");
        assert_eq!(result.files.keys().cloned().collect::<Vec<_>>(), vec!["SKILL.md", "scripts/run.py"]);
        assert_eq!(result.skipped, vec!["image.png"]);
        fs::remove_dir_all(&root).expect("cleanup");
    }

    #[test]
    fn picked_paths_allow_only_what_the_dialog_returned() {
        let picked = PickedPaths::default();
        assert!(!picked.allows(Path::new("/tmp/anything")));
        picked.remember(Path::new("/tmp/chosen"));
        assert!(picked.allows(Path::new("/tmp/chosen")));
        assert!(picked.allows(Path::new("/tmp/chosen/sub/file.md")));
        assert!(!picked.allows(Path::new("/tmp/chosen-other")));
    }
}

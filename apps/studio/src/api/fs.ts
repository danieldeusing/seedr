import { invoke } from "@/core/lib/tauriInvoke";

/**
 * Read-only filesystem access, scoped by the host to the selected repository.
 * Paths are always relative to the repo root with forward slashes; the host
 * refuses absolute paths and anything that escapes the root.
 */
export interface DirEntry {
  name: string;
  kind: "file" | "directory" | "other";
}

export interface FsApi {
  listDir(rel: string): Promise<DirEntry[]>;
  readText(rel: string): Promise<string>;
  pathExists(rel: string): Promise<boolean>;
}

export const fs: FsApi = {
  listDir: (rel) => invoke<DirEntry[]>("list_dir", { rel }),
  readText: (rel) => invoke<string>("read_text", { rel }),
  pathExists: (rel) => invoke<boolean>("path_exists", { rel }),
};

/** Opens a repo-relative path with the OS default application. */
export const openPath = (rel: string): Promise<void> => invoke<void>("open_path", { rel });

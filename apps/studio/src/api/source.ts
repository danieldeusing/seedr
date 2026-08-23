import { invoke } from "@/core/lib/tauriInvoke";

/**
 * Text files under a path the user picked with the native dialog — the one
 * place Studio reads outside the repository, and only paths the host handed
 * out through `pick_path` in this session are accepted.
 */
export interface SourceFiles {
  /** Relative path → text, for text files up to the host's size cap. */
  files: Record<string, string>;
  /** Files that were skipped as binary or too large. */
  skipped: string[];
}

export const readSourceFiles = (path: string): Promise<SourceFiles> => invoke<SourceFiles>("read_source_files", { path });

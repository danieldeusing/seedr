import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A temp directory that gets cleaned up when the test file finishes.
 *
 * These tests deliberately use the real filesystem and real git, so every run
 * left its scratch repos behind — thousands of directories and hundreds of MB
 * accumulated on developer machines and on every CI runner.
 */
const created: string[] = [];

export function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  while (created.length > 0) {
    rmSync(created.pop()!, { recursive: true, force: true });
  }
}

import { vi } from "vitest";

type Handler = (args: Record<string, unknown> | undefined) => unknown;

const handlers = new Map<string, Handler>();
const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>();

/**
 * Register what the mocked host answers for a command. Anything not registered
 * REJECTS — an unknown command is a real failure, never `undefined` (plan §8).
 */
export function onCommand(command: string, handler: Handler): void {
  handlers.set(command, handler);
}

export function resetIpc(): void {
  handlers.clear();
  listeners.clear();
}

/** Fire a host event to every `listen` subscriber. */
export function emit(event: string, payload: unknown = null): void {
  for (const listener of listeners.get(event) ?? []) listener({ payload });
}

export const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
  const handler = handlers.get(command);
  if (!handler) throw new Error(`Unknown IPC command: ${command}`);
  return handler(args);
});

export const listen = vi.fn(async (event: string, callback: (event: { payload: unknown }) => void) => {
  const set = listeners.get(event) ?? new Set();
  set.add(callback);
  listeners.set(event, set);
  return () => {
    set.delete(callback);
  };
});

/** A fake repo-relative filesystem for tests: paths → file text, or directories as null. */
export function mockFs(files: Record<string, string | null>): void {
  const has = (rel: string) => rel in files;
  const isDir = (rel: string) => files[rel] === null;
  onCommand("path_exists", (args) => has(String(args?.rel)));
  onCommand("read_text", (args) => {
    const rel = String(args?.rel);
    if (!has(rel) || isDir(rel)) throw new Error(`${rel}: not a file`);
    return files[rel];
  });
  onCommand("list_dir", (args) => {
    const rel = String(args?.rel);
    if (!isDir(rel)) throw new Error(`${rel}: not a directory`);
    return Object.keys(files)
      .filter((path) => path.startsWith(`${rel}/`) && !path.slice(rel.length + 1).includes("/"))
      .map((path) => ({ name: path.slice(rel.length + 1), kind: isDir(path) ? "directory" : "file" }));
  });
}

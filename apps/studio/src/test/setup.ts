import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { createElement } from "react";
import { invoke, listen, resetIpc } from "./mockIpc";

// This jsdom build ships window.localStorage as an empty object; stores that
// persist a preference need the Storage contract from their first import on.
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, String(value)),
    removeItem: (key: string) => void stored.delete(key),
    clear: () => stored.clear(),
  },
});

// jsdom has no ResizeObserver; panes observe their width to decide stacking.
class QuietResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= QuietResizeObserver as unknown as typeof ResizeObserver;

// Monaco needs a real browser (canvas, workers); under jsdom the preview is a
// <pre> carrying the same content, so every test asserts on what would be shown.
vi.mock("@/features/explorer/MonacoPreview", () => ({
  MonacoPreview: ({ content }: { content: string }) => createElement("pre", { "data-testid": "monaco-preview" }, content),
}));

// The single IPC boundary is replaced by the mock host; an unknown command rejects.
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

afterEach(() => {
  cleanup();
  resetIpc();
  vi.clearAllMocks();
});

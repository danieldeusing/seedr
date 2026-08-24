import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { createElement } from "react";
import { invoke, listen, resetIpc } from "./mockIpc";

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

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { invoke, listen, resetIpc } from "./mockIpc";

// The single IPC boundary is replaced by the mock host; an unknown command rejects.
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

afterEach(() => {
  cleanup();
  resetIpc();
  vi.clearAllMocks();
});

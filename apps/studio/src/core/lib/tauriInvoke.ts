/**
 * The one place that touches Tauri's IPC. Everything else imports `invoke` and
 * `listen` from here, so tests mock a single boundary and a future transport
 * change is one file.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type { UnlistenFn } from "@tauri-apps/api/event";
export { invoke, listen };

import { create } from "zustand";
import { invoke } from "@/core/lib/tauriInvoke";

/**
 * The schemes a link inside registry metadata may reach the system browser
 * with. Item metadata is third-party input, so `javascript:`, `file:` and
 * `data:` never reach the shell however the link was spelled — `URL` resolves
 * the escapes and casings a scheme can hide behind. The Rust host applies the
 * same gate again before handing anything to the opener.
 */
const OPENABLE_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:", "mailto:"]);

export function safeExternalUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return OPENABLE_SCHEMES.has(parsed.protocol) ? parsed.href : null;
}

interface ExternalLinkState {
  /** The URL awaiting the user's confirmation, or null when no dialog is up. */
  pending: string | null;
  /** Ask before leaving the app: every external link goes through this dialog. */
  request(raw: string): void;
  confirm(): Promise<void>;
  cancel(): void;
}

export const useExternalLink = create<ExternalLinkState>((set, get) => ({
  pending: null,

  request(raw) {
    const url = safeExternalUrl(raw);
    if (url) set({ pending: url });
  },

  async confirm() {
    const url = get().pending;
    set({ pending: null });
    if (url) await invoke("open_external", { url });
  },

  cancel() {
    set({ pending: null });
  },
}));

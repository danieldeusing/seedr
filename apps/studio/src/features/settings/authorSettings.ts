import { create } from "zustand";

/**
 * Who this machine credits as the author of a first-party item. The add form
 * prefills from here; without it, it falls back to what the checkout's git
 * remote says, which is right for one repository and wrong the moment you work
 * on a fork or under another name.
 */
export interface AuthorIdentity {
  name: string;
  url: string;
}

const STORAGE_KEY = "studio-author";

const load = (): AuthorIdentity => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const record = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    return { name: typeof record.name === "string" ? record.name : "", url: typeof record.url === "string" ? record.url : "" };
  } catch {
    return { name: "", url: "" };
  }
};

interface AuthorState {
  author: AuthorIdentity;
  set(field: keyof AuthorIdentity, value: string): void;
}

export const useAuthorSettings = create<AuthorState>((set, get) => ({
  author: load(),
  set(field, value) {
    const author = { ...get().author, [field]: value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(author));
    set({ author });
  },
}));

/** The configured author, for code outside React. Empty fields mean "not set". */
export const configuredAuthor = (): AuthorIdentity => useAuthorSettings.getState().author;

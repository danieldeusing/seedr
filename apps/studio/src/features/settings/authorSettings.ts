import { create } from "zustand";
import { readRepoScoped, writeRepoScoped } from "./repoScoped";

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

const load = (root: string): AuthorIdentity => {
  try {
    const parsed: unknown = JSON.parse(readRepoScoped(STORAGE_KEY, root) ?? "{}");
    const record = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
    return { name: typeof record.name === "string" ? record.name : "", url: typeof record.url === "string" ? record.url : "" };
  } catch {
    return { name: "", url: "" };
  }
};

interface AuthorState {
  author: AuthorIdentity;
  /** The checkout these belong to; "" before one is open. */
  root: string;
  /** Point the store at a checkout — its own author, or the machine-wide one. */
  forRepo(root: string): void;
  set(field: keyof AuthorIdentity, value: string): void;
}

export const useAuthorSettings = create<AuthorState>((set, get) => ({
  author: load(""),
  root: "",
  forRepo(root) {
    set({ root, author: load(root) });
  },
  set(field, value) {
    const author = { ...get().author, [field]: value };
    writeRepoScoped(STORAGE_KEY, get().root, JSON.stringify(author));
    set({ author });
  },
}));

/** The configured author, for code outside React. Empty fields mean "not set". */
export const configuredAuthor = (): AuthorIdentity => useAuthorSettings.getState().author;

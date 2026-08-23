import { describe, expect, test } from "vitest";
import { deriveRepoIdentity, itemExternalUrl, type GitRunner } from "./identity.js";

const fakeGit =
  (answers: Record<string, string | Error>): GitRunner =>
  async (args) => {
    const answer = answers[args.join(" ")];
    if (answer === undefined || answer instanceof Error) throw answer ?? new Error(`unexpected git ${args.join(" ")}`);
    return answer;
  };

describe("deriveRepoIdentity", () => {
  test("reads owner, repo, default branch and author from the repo — ssh and https remotes", async () => {
    for (const remote of ["git@github.com:acme/seedr-fork.git", "https://github.com/acme/seedr-fork", "https://github.com/acme/seedr-fork.git"]) {
      const identity = await deriveRepoIdentity("/repo", fakeGit({
        "remote get-url origin": remote,
        "symbolic-ref --short refs/remotes/origin/HEAD": "origin/develop",
        "config user.name": "Acme Bot",
      }));
      expect(identity).toEqual({ owner: "acme", repo: "seedr-fork", defaultBranch: "develop", authorName: "Acme Bot", remoteUrl: remote });
    }
  });

  test("yields nulls instead of guesses when git cannot answer", async () => {
    const identity = await deriveRepoIdentity("/repo", fakeGit({ "remote get-url origin": new Error("no remote") }));
    expect(identity).toEqual({ owner: null, repo: null, defaultBranch: null, authorName: null, remoteUrl: null });
  });

  test("a non-GitHub remote gives no owner or repo", async () => {
    const identity = await deriveRepoIdentity("/repo", fakeGit({ "remote get-url origin": "https://gitlab.com/acme/x.git" }));
    expect(identity.owner).toBeNull();
    expect(identity.remoteUrl).toBe("https://gitlab.com/acme/x.git");
  });
});

describe("itemExternalUrl", () => {
  test("builds a tree URL only when every part is known", () => {
    expect(itemExternalUrl({ owner: "acme", repo: "r", defaultBranch: "main", authorName: null, remoteUrl: null }, "registry/skills/x")).toBe("https://github.com/acme/r/tree/main/registry/skills/x");
    expect(itemExternalUrl({ owner: "acme", repo: "r", defaultBranch: null, authorName: null, remoteUrl: null }, "registry/skills/x")).toBeNull();
  });
});

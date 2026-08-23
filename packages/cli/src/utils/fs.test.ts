import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import {
  assertSafePathSegment,
  resolveContained,
  assertDirectoryWithin,
  removePathEntry,
  moveDirectory,
  writeFileAtomic,
  snapshotFile,
  restoreFile,
  installDirectory,
  installFile,
  assertOverwritable,
  exists,
  isSymlink,
  getSymlinkTarget,
  removeFile,
  readTextFile,
  writeTextFile,
  resolvePath,
  getAgentsPath,
} from "./fs.js";

const HOOKS_LABEL = "hooks directory";
const TARGET_FILE = "/target/sub/file.txt";
const OUTSIDE_SECRET = "/outside/secret";
const DIR_HOOK = "/dir/hook.sh";
const DIR_JSON = "/dir/a.json";
const DIR_SETTINGS = "/dir/settings.json";
const DIR_NEW = "/dir/new.json";
const REGISTRY_SKILL = "/registry/skill";
const REGISTRY_SKILL_MD = "/registry/skill/SKILL.md";
const NEW_FILE = "/new/dir/file.txt";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const ROOT = "/cache";
const OUTSIDE = "/outside";

describe("assertSafePathSegment", () => {
  it.each(["a.b", "1.0.0", "my-plugin", "1.0.0-beta.1", "Plugin_Name", "x"])("accepts %s", (value) => {
    expect(() => assertSafePathSegment(value, "name")).not.toThrow();
  });

  it.each([
    ["../../x", "traversal"],
    ["..", "dot-dot"],
    [".", "dot"],
    ["/etc", "absolute"],
    ["C:\\x", "drive letter"],
    ["a/b", "separator"],
    ["a\\b", "backslash"],
    ["-rf", "leading dash"],
    ["a..b", "embedded dot-dot"],
    ["a:b", "colon"],
    ["a\u0000b", "NUL"],
    ["a\nb", "control character"],
    ["a b", "whitespace"],
    ["   ", "whitespace only"],
    ["", "empty"],
    ["a".repeat(101), "too long"],
    ["ünïcode", "non-ascii"],
    ["\u200bhidden", "zero-width"],
  ])("rejects %j (%s)", (value) => {
    expect(() => assertSafePathSegment(value, "plugin name")).toThrow(/plugin name/);
  });

  it("rejects non-strings and names the field", () => {
    expect(() => assertSafePathSegment(undefined, "plugin version")).toThrow("plugin version must be a non-empty string");
    expect(() => assertSafePathSegment(42, "plugin version")).toThrow("plugin version must be a non-empty string");
  });

  it("accepts exactly 100 characters", () => {
    expect(() => assertSafePathSegment("a".repeat(100), "name")).not.toThrow();
  });
});

describe("resolveContained", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(ROOT, { recursive: true });
    vol.mkdirSync(OUTSIDE, { recursive: true });
  });
  afterEach(() => vol.reset());

  it("returns the resolved absolute path for a strict descendant", async () => {
    await expect(resolveContained(ROOT, "market", "plugin", "1.0.0")).resolves.toBe("/cache/market/plugin/1.0.0");
  });

  it.each([
    [["../../x"]],
    [[".."]],
    [["a", "..", ".."]],
    [["/etc"]],
    [["/cache/../outside"]],
    [["a/../../b"]],
  ])("refuses segments %j that leave the root", async (segments) => {
    await expect(resolveContained(ROOT, ...segments)).rejects.toThrow(/Refusing path outside \/cache/);
  });

  it("refuses the root itself", async () => {
    await expect(resolveContained(ROOT)).rejects.toThrow(/Refusing path outside/);
    await expect(resolveContained(ROOT, ".")).rejects.toThrow(/Refusing path outside/);
    await expect(resolveContained(ROOT, "a", "..")).rejects.toThrow(/Refusing path outside/);
  });

  it("refuses a target whose existing parent is a symlink pointing outside the root", async () => {
    vol.symlinkSync(OUTSIDE, "/cache/escape");
    await expect(resolveContained(ROOT, "escape", "plugin")).rejects.toThrow(/resolves to \/outside/);
  });

  it("refuses when a deeper ancestor is the escaping symlink", async () => {
    vol.symlinkSync(OUTSIDE, "/cache/escape");
    await expect(resolveContained(ROOT, "escape", "a", "b", "c")).rejects.toThrow(/outside/);
  });

  it("allows a symlinked parent that stays inside the root", async () => {
    vol.mkdirSync("/cache/real", { recursive: true });
    vol.symlinkSync("/cache/real", "/cache/alias");
    await expect(resolveContained(ROOT, "alias", "plugin")).resolves.toBe("/cache/alias/plugin");
  });

  it("allows a root that is itself a symlink", async () => {
    vol.symlinkSync(ROOT, "/cache-link");
    await expect(resolveContained("/cache-link", "plugin")).resolves.toBe("/cache-link/plugin");
  });

  it("allows a target whose parents do not exist yet", async () => {
    await expect(resolveContained(ROOT, "new", "deep", "path")).resolves.toBe("/cache/new/deep/path");
  });

  it("allows a root that does not exist yet", async () => {
    await expect(resolveContained("/nonexistent-root", "x")).resolves.toBe("/nonexistent-root/x");
  });

  it("does not follow the target itself (a symlink entry can be removed, not followed)", async () => {
    vol.symlinkSync(OUTSIDE, "/cache/entry");
    await expect(resolveContained(ROOT, "entry")).resolves.toBe("/cache/entry");
  });
});

describe("assertDirectoryWithin", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/project/.claude/hooks", { recursive: true });
    vol.mkdirSync(OUTSIDE, { recursive: true });
  });

  it("accepts a directory inside the scope", async () => {
    await expect(assertDirectoryWithin("/project/.claude/hooks", "/project", HOOKS_LABEL)).resolves.toBeUndefined();
  });

  it("refuses a symlinked directory resolving outside the scope", async () => {
    vol.symlinkSync(OUTSIDE, "/project/.claude/escaped");
    await expect(assertDirectoryWithin("/project/.claude/escaped", "/project", HOOKS_LABEL)).rejects.toThrow(
      /hooks directory \/project\/.claude\/escaped resolves to \/outside, outside \/project/
    );
  });

  it("fails when the directory does not exist", async () => {
    await expect(assertDirectoryWithin("/project/missing", "/project", HOOKS_LABEL)).rejects.toThrow(/could not be resolved/);
  });
});

describe("removePathEntry", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/target/sub", { recursive: true });
    vol.writeFileSync(TARGET_FILE, "keep me");
  });

  it("unlinks a symlink without touching its target", async () => {
    vol.symlinkSync("/target", "/link");
    expect(await removePathEntry("/link")).toBe(true);
    expect(vol.existsSync("/link")).toBe(false);
    expect(vol.readFileSync(TARGET_FILE, "utf-8")).toBe("keep me");
  });

  it("removes a directory recursively", async () => {
    expect(await removePathEntry("/target")).toBe(true);
    expect(vol.existsSync("/target")).toBe(false);
  });

  it("removes a file and reports a missing path", async () => {
    expect(await removePathEntry(TARGET_FILE)).toBe(true);
    expect(await removePathEntry(TARGET_FILE)).toBe(false);
  });
});

describe("writeFileAtomic", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/dir", { recursive: true });
    vol.mkdirSync(OUTSIDE, { recursive: true });
  });

  it("replaces a symlink entry instead of writing through it", async () => {
    vol.writeFileSync(OUTSIDE_SECRET, "original");
    vol.symlinkSync(OUTSIDE_SECRET, DIR_HOOK);
    await writeFileAtomic(DIR_HOOK, "#!/bin/sh\n", { mode: 0o755 });
    expect(vol.readFileSync(OUTSIDE_SECRET, "utf-8")).toBe("original");
    expect(vol.lstatSync(DIR_HOOK).isSymbolicLink()).toBe(false);
    expect(vol.readFileSync(DIR_HOOK, "utf-8")).toBe("#!/bin/sh\n");
    expect(vol.statSync(DIR_HOOK).mode & 0o777).toBe(0o755);
  });

  it("leaves no temporary file behind on success", async () => {
    await writeFileAtomic(DIR_JSON, "{}");
    expect(vol.readdirSync("/dir")).toEqual(["a.json"]);
  });

  it("removes the temporary file and keeps the original when the rename fails", async () => {
    vol.writeFileSync(DIR_JSON, "old");
    const fsp = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValueOnce(new Error("EIO: rename failed"));
    await expect(writeFileAtomic(DIR_JSON, "new")).rejects.toThrow("EIO");
    renameSpy.mockRestore();
    expect(vol.readFileSync(DIR_JSON, "utf-8")).toBe("old");
    expect(vol.readdirSync("/dir")).toEqual(["a.json"]);
  });
});

describe("snapshotFile / restoreFile", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/dir", { recursive: true });
  });

  it("restores content and mode of an existing file", async () => {
    vol.writeFileSync(DIR_SETTINGS, '{"a":1}', { mode: 0o600 });
    const snapshot = await snapshotFile(DIR_SETTINGS);
    vol.writeFileSync(DIR_SETTINGS, "garbage");
    await restoreFile(DIR_SETTINGS, snapshot);
    expect(vol.readFileSync(DIR_SETTINGS, "utf-8")).toBe('{"a":1}');
    expect(vol.statSync(DIR_SETTINGS).mode & 0o777).toBe(0o600);
  });

  it("removes a file that did not exist at snapshot time", async () => {
    const snapshot = await snapshotFile(DIR_NEW);
    expect(snapshot.content).toBeNull();
    vol.writeFileSync(DIR_NEW, "created later");
    await restoreFile(DIR_NEW, snapshot);
    expect(vol.existsSync(DIR_NEW)).toBe(false);
  });
});

describe("moveDirectory", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync("/src/nested", { recursive: true });
    vol.writeFileSync("/src/nested/f.txt", "data");
  });

  it("renames when possible, creating the destination parent", async () => {
    await moveDirectory("/src", "/dest/deep/dir");
    expect(vol.readFileSync("/dest/deep/dir/nested/f.txt", "utf-8")).toBe("data");
    expect(vol.existsSync("/src")).toBe(false);
  });

  it("falls back to copy + remove across devices", async () => {
    const fsp = await import("node:fs/promises");
    const exdev = Object.assign(new Error("EXDEV: cross-device link"), { code: "EXDEV" });
    const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValueOnce(exdev);
    await moveDirectory("/src", "/dest");
    renameSpy.mockRestore();
    expect(vol.readFileSync("/dest/nested/f.txt", "utf-8")).toBe("data");
    expect(vol.existsSync("/src")).toBe(false);
  });

  it("rethrows other rename errors", async () => {
    const fsp = await import("node:fs/promises");
    const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValueOnce(Object.assign(new Error("EACCES"), { code: "EACCES" }));
    await expect(moveDirectory("/src", "/dest")).rejects.toThrow("EACCES");
    renameSpy.mockRestore();
  });
});

describe("install helpers", () => {
  beforeEach(() => {
    vol.reset();
    vol.mkdirSync(REGISTRY_SKILL, { recursive: true });
    vol.writeFileSync(REGISTRY_SKILL_MD, "# skill");
    vol.mkdirSync(OUTSIDE, { recursive: true });
    vol.writeFileSync("/outside/victim", "victim");
  });

  it("installDirectory replaces a symlink destination without following it", async () => {
    vol.symlinkSync(OUTSIDE, "/dest/skill".replace("/skill", ""));
    vol.mkdirSync("/dest2", { recursive: true });
    vol.symlinkSync(OUTSIDE, "/dest2/skill");
    await installDirectory(REGISTRY_SKILL, "/dest2/skill", "copy");
    expect(vol.readFileSync("/outside/victim", "utf-8")).toBe("victim");
    expect(vol.readFileSync("/dest2/skill/SKILL.md", "utf-8")).toBe("# skill");
  });

  it("installDirectory creates a relative symlink", async () => {
    await installDirectory(REGISTRY_SKILL, "/dest/a/skill", "symlink");
    expect(vol.readlinkSync("/dest/a/skill")).toBe("../../registry/skill");
  });

  it("installFile copies or links a single file", async () => {
    await installFile(REGISTRY_SKILL_MD, "/dest/copy.md", "copy");
    expect(vol.readFileSync("/dest/copy.md", "utf-8")).toBe("# skill");
    await installFile(REGISTRY_SKILL_MD, "/dest/link.md", "symlink");
    expect(vol.lstatSync("/dest/link.md").isSymbolicLink()).toBe(true);
  });

  it("assertOverwritable refuses existing paths unless forced", async () => {
    await expect(assertOverwritable(REGISTRY_SKILL, false)).rejects.toThrow(/already exists; pass --force/);
    await expect(assertOverwritable(REGISTRY_SKILL, true)).resolves.toBeUndefined();
    await expect(assertOverwritable("/missing", false)).resolves.toBeUndefined();
  });

  it("small helpers behave", async () => {
    expect(await exists(REGISTRY_SKILL)).toBe(true);
    vol.symlinkSync(REGISTRY_SKILL, "/sl");
    expect(await isSymlink("/sl")).toBe(true);
    expect(await isSymlink(REGISTRY_SKILL)).toBe(false);
    expect(await getSymlinkTarget("/sl")).toBe(REGISTRY_SKILL);
    expect(await getSymlinkTarget(REGISTRY_SKILL)).toBeNull();
    await writeTextFile(NEW_FILE, "hello");
    expect(await readTextFile(NEW_FILE)).toBe("hello");
    expect(await removeFile(NEW_FILE)).toBe(true);
    expect(await removeFile(NEW_FILE)).toBe(false);
    expect(resolvePath("/abs")).toBe("/abs");
    expect(resolvePath("rel", "/base")).toBe("/base/rel");
    expect(getAgentsPath("skill", "pdf", "user", "/cwd")).toBe("/home/testuser/.agents/skills/pdf");
    expect(getAgentsPath("skill", "pdf", "project", "/cwd")).toBe("/cwd/.agents/skills/pdf");
  });
});

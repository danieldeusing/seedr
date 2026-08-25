import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import type { RegistryItem } from "@seedr/shared";

const LINT_COMMAND = ".claude/hooks/lint-hook.sh";
const LINT_FILE = "lint-hook.sh";
const USER_SETTINGS = "/home/testuser/.claude/settings.json";
const OUTSIDE_KEYS = "/outside/authorized_keys";
const SETTINGS_LOCKED = "settings locked";
const MY_HOOK_COMMAND = ".claude/hooks/my-hook.sh";
const NON_EXISTENT = "non-existent";
const OUTSIDE_TARGET = "/outside/target.sh";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", () => ({
  getItem: vi.fn(),
  getItemContent: vi.fn(),
  getItemSourcePath: vi.fn((item: RegistryItem) => `/registry/${item.type}s/${item.slug}`),
  fetchItemToDestination: vi.fn(),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";
const CLAUDE_DIR = `${PROJECT}/.claude`;
const HOOKS_DIR = `${CLAUDE_DIR}/hooks`;
const SETTINGS = `${CLAUDE_DIR}/settings.json`;
const LINT_SCRIPT = "#!/bin/bash\npnpm lint";
const PRE_COMMIT = "PreCommit";
const PRE_TOOL_USE = "PreToolUse";
const COMMAND = "command";

function hookItem(slug: string, triggers: { event: string; matcher?: string }[] = [{ event: PRE_COMMIT }], overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug,
    name: `Hook ${slug}`,
    type: "hook",
    description: "A hook",
    compatibility: ["claude"],
    contents: { files: [{ name: `${slug}.sh`, type: "file" }], triggers },
    ...overrides,
  };
}

function hookCommand(path: string) {
  return { type: COMMAND, command: path };
}

function writeSettings(settings: unknown): void {
  vol.mkdirSync(CLAUDE_DIR, { recursive: true });
  vol.writeFileSync(SETTINGS, JSON.stringify(settings));
}

function writeRegistryScript(slug: string, content = LINT_SCRIPT): void {
  vol.mkdirSync(`/registry/hooks/${slug}`, { recursive: true });
  vol.writeFileSync(`/registry/hooks/${slug}/${slug}.sh`, content);
}

// Inferred from JSON.parse on purpose: fixtures are free-form documents.
function readSettings() {
  return JSON.parse(vol.readFileSync(SETTINGS, "utf-8") as string);
}

async function mockRegistryItem(item: RegistryItem | undefined): Promise<void> {
  const { getItem } = await import("../config/registry.js");
  vi.mocked(getItem).mockResolvedValue(item);
}

describe("hook handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.resetAllMocks();
  });

  describe("installHook", () => {
    it("should merge hook into settings.json", async () => {
      const { installHook } = await import("./hook.js");
      writeSettings({ existing: true });
      writeRegistryScript("lint-hook");

      const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      expect(results[0]?.path).toBe(`${HOOKS_DIR}/lint-hook.sh`);

      const settings = readSettings();
      expect(settings.existing).toBe(true);
      expect(settings.hooks[PRE_COMMIT]).toEqual([{ hooks: [hookCommand(LINT_COMMAND)] }]);
      expect(vol.readFileSync(`${HOOKS_DIR}/lint-hook.sh`, "utf-8")).toBe(LINT_SCRIPT);
      expect(vol.statSync(`${HOOKS_DIR}/lint-hook.sh`).mode & 0o777).toBe(0o755);
      expect(vol.readdirSync(HOOKS_DIR)).toEqual([LINT_FILE]);
    });

    it("refuses a script name from the registry that escapes the hooks directory", async () => {
      const { installHook } = await import("./hook.js");
      // assertSafePathSegment guards this name, but every fixture fed it a safe
      // one — the throw branch was covered by running, never by tripping.
      const item = hookItem("evil", [{ event: PRE_COMMIT }], {
        contents: { files: [{ name: "../../../.ssh/authorized_keys.sh", type: "file" }], triggers: [{ event: PRE_COMMIT }] },
      });

      const results = await installHook(item, ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toMatch(/[Uu]nsafe|Invalid/);
      expect(vol.existsSync("/.ssh/authorized_keys.sh")).toBe(false);
    });

    it("should append to existing hooks array with same matcher", async () => {
      const { installHook } = await import("./hook.js");
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand("pnpm lint")] }] } });
      writeRegistryScript("test-hook", "#!/bin/bash\npnpm test");

      await installHook(hookItem("test-hook"), ["claude"], "project", "copy", true, PROJECT);

      const settings = readSettings();
      expect(settings.hooks[PRE_COMMIT]).toHaveLength(1);
      expect(settings.hooks[PRE_COMMIT][0].hooks).toEqual([hookCommand("pnpm lint"), hookCommand(".claude/hooks/test-hook.sh")]);
    });

    it("does not duplicate a command that is already registered", async () => {
      const { installHook } = await import("./hook.js");
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(LINT_COMMAND)] }] } });
      writeRegistryScript("lint-hook");

      await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

      expect(readSettings().hooks[PRE_COMMIT][0].hooks).toHaveLength(1);
    });

    it("should fail for non-claude tools", async () => {
      const { installHook } = await import("./hook.js");
      const results = await installHook(hookItem("lint-hook"), ["copilot"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("only supported for Claude");
    });

    it("fails without triggers or script", async () => {
      const { installHook } = await import("./hook.js");
      expect((await installHook(hookItem("x", []), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toBe("No triggers defined for this hook");
      const noScript = hookItem("x", [{ event: PRE_COMMIT }], { contents: { files: [{ name: "README.md", type: "file" }], triggers: [{ event: PRE_COMMIT }] } });
      expect((await installHook(noScript, ["claude"], "project", "copy", true, PROJECT))[0]?.error).toBe("No script file found in hook");
    });

    it("should use hook key with matcher when provided", async () => {
      const { installHook } = await import("./hook.js");
      writeSettings({});
      writeRegistryScript("ts-check-hook", "#!/bin/bash\ntsc --noEmit");

      await installHook(hookItem("ts-check-hook", [{ event: PRE_COMMIT, matcher: "*.ts" }]), ["claude"], "project", "copy", true, PROJECT);

      const settings = readSettings();
      expect(settings.hooks[PRE_COMMIT][0].matcher).toBe("*.ts");
      expect(settings.hooks[PRE_COMMIT][0].hooks[0].command).toBe(".claude/hooks/ts-check-hook.sh");
    });

    it("installs into ~/.claude for user scope", async () => {
      const { installHook } = await import("./hook.js");
      writeRegistryScript("lint-hook");

      const results = await installHook(hookItem("lint-hook"), ["claude"], "user", "copy", true, PROJECT);

      expect(results[0]?.path).toBe("/home/testuser/.claude/hooks/lint-hook.sh");
      const settings = JSON.parse(vol.readFileSync(USER_SETTINGS, "utf-8") as string);
      expect(settings.hooks[PRE_COMMIT][0].hooks[0].command).toBe("~/.claude/hooks/lint-hook.sh");
    });

    it("refuses to overwrite an existing script without force", async () => {
      const { installHook } = await import("./hook.js");
      writeRegistryScript("lint-hook");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      vol.writeFileSync(`${HOOKS_DIR}/lint-hook.sh`, "user version");

      const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", false, PROJECT);

      expect(results[0]?.error).toMatch(/already exists; pass --force/);
      expect(vol.readFileSync(`${HOOKS_DIR}/lint-hook.sh`, "utf-8")).toBe("user version");
      expect(vol.existsSync(SETTINGS)).toBe(false);
    });

    it("replaces an existing regular file atomically with --force", async () => {
      const { installHook } = await import("./hook.js");
      writeRegistryScript("lint-hook");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      vol.writeFileSync(`${HOOKS_DIR}/lint-hook.sh`, "old", { mode: 0o644 });

      const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(vol.readFileSync(`${HOOKS_DIR}/lint-hook.sh`, "utf-8")).toBe(LINT_SCRIPT);
      expect(vol.statSync(`${HOOKS_DIR}/lint-hook.sh`).mode & 0o777).toBe(0o755);
      expect(vol.readdirSync(HOOKS_DIR)).toEqual([LINT_FILE]);
    });

    describe("symlink destinations", () => {
      beforeEach(() => {
        writeRegistryScript("lint-hook");
        vol.mkdirSync(HOOKS_DIR, { recursive: true });
        vol.mkdirSync("/outside", { recursive: true });
      });

      it("refuses a destination symlink pointing at a file inside the project", async () => {
        const { installHook } = await import("./hook.js");
        vol.writeFileSync(`${PROJECT}/package.json`, '{"name":"victim"}');
        vol.symlinkSync(`${PROJECT}/package.json`, `${HOOKS_DIR}/lint-hook.sh`);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.success).toBe(false);
        expect(results[0]?.error).toMatch(/lint-hook.sh is a symbolic link; refusing to write through it/);
        expect(vol.readFileSync(`${PROJECT}/package.json`, "utf-8")).toBe('{"name":"victim"}');
        expect(vol.lstatSync(`${HOOKS_DIR}/lint-hook.sh`).isSymbolicLink()).toBe(true);
        expect(vol.existsSync(SETTINGS)).toBe(false);
      });

      it("refuses a destination symlink pointing outside the project", async () => {
        const { installHook } = await import("./hook.js");
        vol.writeFileSync(OUTSIDE_KEYS, "keys");
        vol.symlinkSync(OUTSIDE_KEYS, `${HOOKS_DIR}/lint-hook.sh`);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.success).toBe(false);
        expect(results[0]?.error).toMatch(/symbolic link/);
        expect(vol.readFileSync(OUTSIDE_KEYS, "utf-8")).toBe("keys");
        expect(vol.statSync(OUTSIDE_KEYS).mode & 0o777).not.toBe(0o755);
      });

      it("refuses a broken destination symlink", async () => {
        const { installHook } = await import("./hook.js");
        vol.symlinkSync("/nowhere/missing", `${HOOKS_DIR}/lint-hook.sh`);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.error).toMatch(/symbolic link/);
        expect(vol.existsSync("/nowhere")).toBe(false);
      });

      it("refuses a destination that is a directory", async () => {
        const { installHook } = await import("./hook.js");
        vol.mkdirSync(`${HOOKS_DIR}/lint-hook.sh`);
        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);
        expect(results[0]?.error).toMatch(/exists and is not a regular file/);
      });

      it("refuses a hooks directory that is a symlink escaping the project", async () => {
        const { installHook } = await import("./hook.js");
        vol.rmdirSync(HOOKS_DIR);
        vol.symlinkSync("/outside", HOOKS_DIR);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.success).toBe(false);
        expect(results[0]?.error).toMatch(/hooks directory .* resolves to \/outside, outside \/my\/project/);
        expect(vol.readdirSync("/outside")).toEqual([]);
      });

      it("refuses a .claude directory that is a symlink escaping the project", async () => {
        const { installHook } = await import("./hook.js");
        vol.rmSync(CLAUDE_DIR, { recursive: true });
        vol.symlinkSync("/outside", CLAUDE_DIR);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.error).toMatch(/Refusing path outside \/my\/project/);
        expect(vol.readdirSync("/outside")).toEqual([]);
      });

      it("accepts a hooks directory symlinked to another place inside the project", async () => {
        const { installHook } = await import("./hook.js");
        vol.rmdirSync(HOOKS_DIR);
        vol.mkdirSync(`${PROJECT}/shared-hooks`, { recursive: true });
        vol.symlinkSync(`${PROJECT}/shared-hooks`, HOOKS_DIR);

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

        expect(results[0]?.success).toBe(true);
        expect(vol.readFileSync(`${PROJECT}/shared-hooks/lint-hook.sh`, "utf-8")).toBe(LINT_SCRIPT);
      });
    });

    it("fetches remote content through a mkdtemp directory that is removed afterwards", async () => {
      const { getItemSourcePath, fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(getItemSourcePath).mockReturnValue(null);
      let fetchDir = "";
      vi.mocked(fetchItemToDestination).mockImplementation(async (_item: RegistryItem, dest: string) => {
        fetchDir = dest;
        vol.mkdirSync(dest, { recursive: true });
        vol.writeFileSync(`${dest}/lint-hook.sh`, "#!/bin/sh\nremote");
        return { sourceRevision: null, contentDigest: null, files: [LINT_FILE] };
      });
      const { installHook } = await import("./hook.js");

      const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(fetchDir).toMatch(new RegExp(`^${CLAUDE_DIR}/\\.seedr-hook-[^/]+/content$`));
      expect(vol.existsSync(fetchDir)).toBe(false);
      expect(vol.readdirSync(CLAUDE_DIR).sort()).toEqual(["hooks", "settings.json"]);
      expect(vol.readFileSync(`${HOOKS_DIR}/lint-hook.sh`, "utf-8")).toBe("#!/bin/sh\nremote");
    });

    it("removes the temp directory and installs nothing when the download fails", async () => {
      const { getItemSourcePath, fetchItemToDestination } = await import("../config/registry.js");
      vi.mocked(getItemSourcePath).mockReturnValue(null);
      vi.mocked(fetchItemToDestination).mockRejectedValue(new Error("Registry integrity error: mismatch"));
      const { installHook } = await import("./hook.js");

      const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);

      expect(results[0]?.error).toMatch(/Registry integrity error/);
      expect(vol.readdirSync(CLAUDE_DIR)).toEqual(["hooks"]);
      expect(vol.readdirSync(HOOKS_DIR)).toEqual([]);
    });

    describe("rollback", () => {
      it("removes a freshly written script when the settings write fails", async () => {
        writeRegistryScript("lint-hook");
        const json = await import("../utils/json.js");
        const writeSpy = vi.spyOn(json, "writeJson").mockRejectedValue(new Error(SETTINGS_LOCKED));
        const { installHook } = await import("./hook.js");

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);
        writeSpy.mockRestore();

        expect(results[0]?.error).toBe(SETTINGS_LOCKED);
        expect(vol.existsSync(`${HOOKS_DIR}/lint-hook.sh`)).toBe(false);
        expect(vol.readdirSync(HOOKS_DIR)).toEqual([]);
      });

      it("restores the previous script when the settings write fails after a forced replacement", async () => {
        writeRegistryScript("lint-hook");
        vol.mkdirSync(HOOKS_DIR, { recursive: true });
        vol.writeFileSync(`${HOOKS_DIR}/lint-hook.sh`, "previous", { mode: 0o700 });
        const json = await import("../utils/json.js");
        const writeSpy = vi.spyOn(json, "writeJson").mockRejectedValue(new Error(SETTINGS_LOCKED));
        const { installHook } = await import("./hook.js");

        await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);
        writeSpy.mockRestore();

        expect(vol.readFileSync(`${HOOKS_DIR}/lint-hook.sh`, "utf-8")).toBe("previous");
        expect(vol.statSync(`${HOOKS_DIR}/lint-hook.sh`).mode & 0o777).toBe(0o700);
        expect(vol.readdirSync(HOOKS_DIR)).toEqual([LINT_FILE]);
      });

      it("leaves no temp file when the script rename fails", async () => {
        writeRegistryScript("lint-hook");
        const fsp = await import("node:fs/promises");
        const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValue(new Error("EIO"));
        const { installHook } = await import("./hook.js");

        const results = await installHook(hookItem("lint-hook"), ["claude"], "project", "copy", true, PROJECT);
        renameSpy.mockRestore();

        expect(results[0]?.error).toBe("EIO");
        expect(vol.readdirSync(HOOKS_DIR)).toEqual([]);
        expect(vol.existsSync(SETTINGS)).toBe(false);
      });
    });
  });

  describe("hookHandler", () => {
    it("should implement ContentHandler interface", async () => {
      const { hookHandler } = await import("./hook.js");

      expect(hookHandler.type).toBe("hook");
      expect(typeof hookHandler.install).toBe("function");
      expect(typeof hookHandler.uninstall).toBe("function");
      expect(typeof hookHandler.listInstalled).toBe("function");
      expect(typeof hookHandler.plan).toBe("function");
    });
  });

  describe("uninstallHook", () => {
    it("should remove hook entries from settings.json and delete script file", async () => {
      await mockRegistryItem(hookItem("lint-hook", [{ event: PRE_TOOL_USE, matcher: "Bash" }]));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ hooks: { [PRE_TOOL_USE]: [{ matcher: "Bash", hooks: [hookCommand(LINT_COMMAND)] }] } });
      vol.writeFileSync(`${HOOKS_DIR}/lint-hook.sh`, LINT_SCRIPT);

      const result = await uninstallHook("lint-hook", "claude", "project", PROJECT);

      expect(result).toBe(true);
      expect(readSettings().hooks).toBeUndefined();
      expect(vol.existsSync(`${HOOKS_DIR}/lint-hook.sh`)).toBe(false);
    });

    it("should preserve unrelated hooks in same event", async () => {
      await mockRegistryItem(hookItem("hook-a", [{ event: PRE_TOOL_USE, matcher: "Bash" }]));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ hooks: { [PRE_TOOL_USE]: [{ matcher: "Bash", hooks: [hookCommand(".claude/hooks/hook-a.sh"), hookCommand(".claude/hooks/hook-b.sh")] }] } });
      vol.writeFileSync(`${HOOKS_DIR}/hook-a.sh`, "#!/bin/bash\necho a");

      await uninstallHook("hook-a", "claude", "project", PROJECT);

      const settings = readSettings();
      expect(settings.hooks[PRE_TOOL_USE]).toHaveLength(1);
      expect(settings.hooks[PRE_TOOL_USE][0].matcher).toBe("Bash");
      expect(settings.hooks[PRE_TOOL_USE][0].hooks).toEqual([hookCommand(".claude/hooks/hook-b.sh")]);
    });

    it("should remove hook from multiple events", async () => {
      await mockRegistryItem(hookItem("security-guard", [{ event: PRE_TOOL_USE, matcher: "Bash" }, { event: PRE_TOOL_USE, matcher: "Write" }]));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({
        hooks: {
          [PRE_TOOL_USE]: [
            { matcher: "Bash", hooks: [hookCommand(".claude/hooks/security-guard.sh")] },
            { matcher: "Write", hooks: [hookCommand(".claude/hooks/security-guard.sh")] },
          ],
        },
      });
      vol.writeFileSync(`${HOOKS_DIR}/security-guard.sh`, "#!/bin/bash\necho guard");

      expect(await uninstallHook("security-guard", "claude", "project", PROJECT)).toBe(true);
      expect(readSettings().hooks).toBeUndefined();
    });

    it("should clean up empty events and hooks key", async () => {
      await mockRegistryItem(hookItem("solo-hook"));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(".claude/hooks/solo-hook.sh")] }] } });
      vol.writeFileSync(`${HOOKS_DIR}/solo-hook.sh`, "#!/bin/bash\necho solo");

      await uninstallHook("solo-hook", "claude", "project", PROJECT);

      expect(Object.keys(readSettings())).toHaveLength(0);
    });

    it("should handle user-modified settings around hooks", async () => {
      await mockRegistryItem(hookItem("my-hook"));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ customSetting: "keep-me", hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(MY_HOOK_COMMAND)] }] }, anotherSetting: 42 });
      vol.writeFileSync(`${HOOKS_DIR}/my-hook.sh`, "#!/bin/bash\necho hook");

      await uninstallHook("my-hook", "claude", "project", PROJECT);

      const settings = readSettings();
      expect(settings.customSetting).toBe("keep-me");
      expect(settings.anotherSetting).toBe(42);
      expect(settings.hooks).toBeUndefined();
    });

    it("falls back to <slug>.sh when the registry does not know the hook", async () => {
      await mockRegistryItem(undefined);
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(".claude/hooks/unknown-hook.sh")] }] } });
      vol.writeFileSync(`${HOOKS_DIR}/unknown-hook.sh`, "x");

      expect(await uninstallHook("unknown-hook", "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(`${HOOKS_DIR}/unknown-hook.sh`)).toBe(false);
    });

    it("should return false for non-existent hook", async () => {
      await mockRegistryItem(undefined);
      const { uninstallHook } = await import("./hook.js");
      expect(await uninstallHook(NON_EXISTENT, "claude", "project", PROJECT)).toBe(false);
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand("other")] }] } });
      expect(await uninstallHook(NON_EXISTENT, "claude", "project", PROJECT)).toBe(false);
      writeSettings({});
      expect(await uninstallHook(NON_EXISTENT, "claude", "project", PROJECT)).toBe(false);
    });

    it("should return false for non-claude tools", async () => {
      const { uninstallHook } = await import("./hook.js");
      expect(await uninstallHook("any-hook", "copilot", "project", PROJECT)).toBe(false);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï", "-rf", "a".repeat(101)])("rejects invalid slug %j before touching anything", async (slug) => {
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(".claude/hooks/x.sh")] }] } });
      await expect(uninstallHook(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid hook slug/);
      expect(readSettings().hooks[PRE_COMMIT]).toHaveLength(1);
    });

    it("only deletes inside a hooks directory that resolves inside the project", async () => {
      await mockRegistryItem(undefined);
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(CLAUDE_DIR, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync("/outside/my-hook.sh", "victim");
      vol.symlinkSync("/outside", HOOKS_DIR);
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(MY_HOOK_COMMAND)] }] } });

      await expect(uninstallHook("my-hook", "claude", "project", PROJECT)).rejects.toThrow(/resolves to \/outside, outside/);
      expect(vol.existsSync("/outside/my-hook.sh")).toBe(true);
    });

    it("unlinks a symlink entry without following it and refuses directories", async () => {
      await mockRegistryItem(undefined);
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync(HOOKS_DIR, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync(OUTSIDE_TARGET, "target");
      vol.symlinkSync(OUTSIDE_TARGET, `${HOOKS_DIR}/linked.sh`);
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(".claude/hooks/linked.sh")] }] } });

      expect(await uninstallHook("linked", "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(`${HOOKS_DIR}/linked.sh`)).toBe(false);
      expect(vol.readFileSync(OUTSIDE_TARGET, "utf-8")).toBe("target");

      vol.mkdirSync(`${HOOKS_DIR}/dir-hook.sh`);
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(".claude/hooks/dir-hook.sh")] }] } });
      await expect(uninstallHook("dir-hook", "claude", "project", PROJECT)).rejects.toThrow(/is a directory; refusing to remove it/);
      expect(vol.existsSync(`${HOOKS_DIR}/dir-hook.sh`)).toBe(true);
    });

    it("uses the registry script name and user scope paths", async () => {
      await mockRegistryItem(hookItem("guard", [{ event: PRE_COMMIT }], { contents: { files: [{ name: "guard-script.sh", type: "file" }], triggers: [{ event: PRE_COMMIT }] } }));
      const { uninstallHook } = await import("./hook.js");
      vol.mkdirSync("/home/testuser/.claude/hooks", { recursive: true });
      vol.writeFileSync(USER_SETTINGS, JSON.stringify({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand("~/.claude/hooks/guard-script.sh")] }] } }));
      vol.writeFileSync("/home/testuser/.claude/hooks/guard-script.sh", "x");

      expect(await uninstallHook("guard", "claude", "user", PROJECT)).toBe(true);
      expect(vol.existsSync("/home/testuser/.claude/hooks/guard-script.sh")).toBe(false);
      expect(JSON.parse(vol.readFileSync(USER_SETTINGS, "utf-8") as string).hooks).toBeUndefined();
    });
  });

  describe("getInstalledHooks", () => {
    it("should return slugs from hook command paths", async () => {
      const { getInstalledHooks } = await import("./hook.js");
      writeSettings({ hooks: { [PRE_COMMIT]: [{ hooks: [hookCommand(MY_HOOK_COMMAND)] }] } });
      expect(await getInstalledHooks("claude", "project", PROJECT)).toEqual(["my-hook"]);
    });

    it("should return empty for no hooks, no settings or other agents", async () => {
      const { getInstalledHooks } = await import("./hook.js");
      expect(await getInstalledHooks("claude", "project", PROJECT)).toEqual([]);
      writeSettings({});
      expect(await getInstalledHooks("claude", "project", PROJECT)).toEqual([]);
      expect(await getInstalledHooks("copilot", "project", PROJECT)).toEqual([]);
    });

    it("should deduplicate slugs across events", async () => {
      const { getInstalledHooks } = await import("./hook.js");
      writeSettings({
        hooks: {
          [PRE_TOOL_USE]: [
            { matcher: "Bash", hooks: [hookCommand(".claude/hooks/guard.sh")] },
            { matcher: "Write", hooks: [hookCommand(".claude/hooks/guard.sh")] },
          ],
        },
      });
      expect(await getInstalledHooks("claude", "project", PROJECT)).toEqual(["guard"]);
    });
  });

  describe("planHook", () => {
    it("lists the script and the settings file with the events, without writing", async () => {
      const { planHook } = await import("./hook.js");
      writeSettings({});

      const plan = await planHook(hookItem("lint-hook", [{ event: PRE_COMMIT }, { event: PRE_TOOL_USE, matcher: "Bash" }]), ["claude"], "project", "copy", PROJECT);

      expect(plan).toEqual([
        { agent: "claude", kind: "create", path: `${HOOKS_DIR}/lint-hook.sh`, detail: "executable hook script" },
        { agent: "claude", kind: "modify", path: SETTINGS, detail: "hooks: PreCommit, PreToolUse[Bash] → .claude/hooks/lint-hook.sh" },
      ]);
      expect(vol.existsSync(HOOKS_DIR)).toBe(false);
    });

    it("rejects non-claude agents and hooks without a script", async () => {
      const { planHook } = await import("./hook.js");
      await expect(planHook(hookItem("x"), ["gemini"], "project", "copy", PROJECT)).rejects.toThrow(/only supported for Claude Code/);
      await expect(planHook(hookItem("x", [{ event: PRE_COMMIT }], { contents: { files: [] } }), ["claude"], "project", "copy", PROJECT)).rejects.toThrow(/No script file/);
    });
  });
});

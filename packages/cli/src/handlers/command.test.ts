import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { isFirstParty } from "@seedr/registry-ops/pure";
import type { RegistryItem } from "@seedr/shared";

const TEST_COMMAND = "test-command";
const OUTSIDE_COMMAND = "/outside/command.md";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

// Mock the registry module
vi.mock("../config/registry.js", async () => ({
  // `mainFileName` stays real: it is the one definition of what a type's content
  // file is called, and the point of these tests is that the handler agrees with
  // whatever `getItemContent` would fetch.
  ...(await vi.importActual<typeof import("../config/registry.js")>("../config/registry.js")),
  getItemSourcePath: vi.fn((item: RegistryItem) => {
    if (isFirstParty(item.sourceType)) {
      return `/registry/commands/${item.slug}`;
    }
    return null;
  }),
  getItemContent: vi.fn(async () => "---\ndescription: Test Command\n---\n\nDo the thing."),
}));

// Mock homedir
vi.mock("node:os", () => ({
  homedir: () => "/home/testuser",
}));

const PROJECT = "/my/project";
const COMMANDS_DIR = `${PROJECT}/.claude/commands`;
const COMMAND_FILE = `${COMMANDS_DIR}/test-command.md`;

function commandItem(overrides: Partial<RegistryItem> = {}): RegistryItem {
  return {
    slug: TEST_COMMAND,
    name: "Test Command",
    type: "command",
    description: "A test command",
    compatibility: ["claude"],
    sourceType: "seedr",
    ...overrides,
  };
}

describe("command handler", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
    vi.clearAllMocks();
  });

  describe("installCommand", () => {
    it("installs the command as a single file named for its slug", async () => {
      const { installCommand } = await import("./command.js");

      const results = await installCommand(commandItem(), ["claude"], "project", "copy", true, PROJECT);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
      // The slug is the file name because it is what the agent invokes: /test-command
      expect(results[0]?.path).toBe(COMMAND_FILE);
      expect(vol.readFileSync(COMMAND_FILE, "utf-8")).toContain("Do the thing.");
    });

    it("symlinks a local command.md when asked to", async () => {
      vol.fromJSON({ "/registry/commands/test-command/command.md": "# local" });
      const { installCommand } = await import("./command.js");

      const results = await installCommand(commandItem(), ["claude"], "project", "symlink", true, PROJECT);

      expect(results[0]?.success).toBe(true);
      expect(vol.lstatSync(COMMAND_FILE).isSymbolicLink()).toBe(true);
      expect(vol.readlinkSync(COMMAND_FILE)).toBe("../../../../registry/commands/test-command/command.md");
    });

    it("falls back to content when symlink is requested but no local file exists", async () => {
      const { installCommand } = await import("./command.js");
      const results = await installCommand(commandItem({ sourceType: "official" }), ["claude"], "user", "symlink", true, PROJECT);
      expect(results[0]?.path).toBe("/home/testuser/.claude/commands/test-command.md");
      expect(vol.lstatSync("/home/testuser/.claude/commands/test-command.md").isSymbolicLink()).toBe(false);
    });

    it("fails for agents that have no commands directory", async () => {
      const { installCommand } = await import("./command.js");
      const results = await installCommand(commandItem(), ["copilot"], "project", "copy", true, PROJECT);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.error).toContain("does not support commands");
    });

    it("refuses to overwrite without force", async () => {
      const { installCommand } = await import("./command.js");
      vol.mkdirSync(COMMANDS_DIR, { recursive: true });
      vol.writeFileSync(COMMAND_FILE, "mine");
      const results = await installCommand(commandItem(), ["claude"], "project", "copy", false, PROJECT);
      expect(results[0]?.error).toMatch(/already exists; pass --force/);
      expect(vol.readFileSync(COMMAND_FILE, "utf-8")).toBe("mine");
    });

    it("rejects invalid slugs and escaping the commands directory", async () => {
      const { installCommand } = await import("./command.js");
      expect((await installCommand(commandItem({ slug: "../x" }), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toMatch(/Invalid command slug/);

      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.symlinkSync("/outside", COMMANDS_DIR);
      expect((await installCommand(commandItem(), ["claude"], "project", "copy", true, PROJECT))[0]?.error).toMatch(/Refusing path outside/);
      expect(vol.readdirSync("/outside")).toEqual([]);
    });
  });

  describe("uninstallCommand", () => {
    it("removes an installed command", async () => {
      const { uninstallCommand } = await import("./command.js");
      vol.mkdirSync(COMMANDS_DIR, { recursive: true });
      vol.writeFileSync(COMMAND_FILE, "# Command");

      expect(await uninstallCommand(TEST_COMMAND, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(COMMAND_FILE)).toBe(false);
    });

    it("returns false for a command that is not there, or an agent without commands", async () => {
      const { uninstallCommand } = await import("./command.js");
      expect(await uninstallCommand("nonexistent", "claude", "project", PROJECT)).toBe(false);
      expect(await uninstallCommand(TEST_COMMAND, "copilot", "project", PROJECT)).toBe(false);
    });

    it("unlinks a symlink entry without following it, and refuses directories", async () => {
      const { uninstallCommand } = await import("./command.js");
      vol.mkdirSync(COMMANDS_DIR, { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync(OUTSIDE_COMMAND, "target");
      vol.symlinkSync(OUTSIDE_COMMAND, COMMAND_FILE);

      expect(await uninstallCommand(TEST_COMMAND, "claude", "project", PROJECT)).toBe(true);
      expect(vol.existsSync(COMMAND_FILE)).toBe(false);
      expect(vol.readFileSync(OUTSIDE_COMMAND, "utf-8")).toBe("target");

      vol.mkdirSync(`${COMMANDS_DIR}/dir-command.md`);
      await expect(uninstallCommand("dir-command", "claude", "project", PROJECT)).rejects.toThrow(/is a directory; refusing/);
    });

    it.each(["../x", "../../x", "/etc", "a/b", "a\\b", "", "%2e%2e", "ünï", "a".repeat(101)])("rejects invalid slug %j", async (slug) => {
      const { uninstallCommand } = await import("./command.js");
      await expect(uninstallCommand(slug, "claude", "project", PROJECT)).rejects.toThrow(/Invalid command slug/);
    });

    it("refuses a commands directory resolving outside the scope root", async () => {
      const { uninstallCommand } = await import("./command.js");
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync("/outside/test-command.md", "victim");
      vol.mkdirSync(`${PROJECT}/.claude`, { recursive: true });
      vol.symlinkSync("/outside", COMMANDS_DIR);

      await expect(uninstallCommand(TEST_COMMAND, "claude", "project", PROJECT)).rejects.toThrow(/Refusing path outside/);
      expect(vol.existsSync("/outside/test-command.md")).toBe(true);
    });
  });

  describe("getInstalledCommands", () => {
    it("lists installed commands", async () => {
      const { getInstalledCommands } = await import("./command.js");
      vol.mkdirSync(COMMANDS_DIR, { recursive: true });
      vol.writeFileSync(`${COMMANDS_DIR}/review.md`, "# A");
      vol.writeFileSync(`${COMMANDS_DIR}/ship.md`, "# B");
      vol.writeFileSync(`${COMMANDS_DIR}/notes.txt`, "x");

      expect((await getInstalledCommands("claude", "project", PROJECT)).sort()).toEqual(["review", "ship"]);
    });

    it("returns an empty array for an agent without commands", async () => {
      const { getInstalledCommands } = await import("./command.js");
      expect(await getInstalledCommands("copilot", "project", PROJECT)).toEqual([]);
    });
  });

  describe("planCommand", () => {
    it("describes the file that would be written", async () => {
      const { planCommand } = await import("./command.js");
      vol.fromJSON({ "/registry/commands/test-command/command.md": "# local" });
      expect(await planCommand(commandItem(), ["claude"], "project", "symlink", PROJECT)).toEqual([
        { agent: "claude", kind: "create", path: COMMAND_FILE, detail: "symlink → /registry/commands/test-command/command.md" },
      ]);
      vol.mkdirSync(COMMANDS_DIR, { recursive: true });
      vol.writeFileSync(COMMAND_FILE, "x");
      expect(await planCommand(commandItem({ sourceType: "official" }), ["claude"], "project", "copy", PROJECT)).toEqual([
        { agent: "claude", kind: "modify", path: COMMAND_FILE, detail: "slash command file" },
      ]);
      await expect(planCommand(commandItem(), ["copilot"], "project", "copy", PROJECT)).rejects.toThrow(/does not support commands/);
    });
  });

  describe("commandHandler", () => {
    it("is registered, so `seedr add --type command` resolves a handler", async () => {
      // The gap this closes: `command` was in ALL_TYPES, in AGENT_COMPATIBILITY
      // and had an install path, but no handler — so the first command item
      // anyone added would have failed with `No handler found for type`.
      const { getHandler, hasHandler } = await import("./registry.js");
      await import("./index.js");
      expect(hasHandler("command")).toBe(true);
      expect(getHandler("command")?.type).toBe("command");
    });

    it("implements the ContentHandler interface", async () => {
      const { commandHandler } = await import("./command.js");

      expect(commandHandler.type).toBe("command");
      expect(typeof commandHandler.install).toBe("function");
      expect(typeof commandHandler.uninstall).toBe("function");
      expect(typeof commandHandler.listInstalled).toBe("function");
      expect(typeof commandHandler.plan).toBe("function");
    });
  });
});

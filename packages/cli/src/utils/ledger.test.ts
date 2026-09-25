import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});
vi.mock("node:os", () => ({ homedir: () => "/home/testuser" }));

const LEDGER = "/home/testuser/.seedr/installed.json";

function read(): Record<string, unknown> {
  return JSON.parse(vol.readFileSync(LEDGER, "utf-8") as string);
}

const base = {
  type: "plugin" as const,
  slug: "vu3-agent-kit",
  agents: ["copilot" as const],
  scope: "user" as const,
  installedAt: "2026-09-22T00:00:00.000Z",
};

describe("install ledger", () => {
  beforeEach(() => {
    vol.reset();
    vi.resetModules();
  });

  it("records the version an install put on the machine", async () => {
    const { recordInstall } = await import("./ledger.js");

    await recordInstall({ ...base, version: "0.16.2", contentDigest: "a".repeat(64) });

    const ledger = read();
    expect(ledger.version).toBe(1);
    expect(ledger.items).toMatchObject({
      "plugin:vu3-agent-kit": { version: "0.16.2", contentDigest: "a".repeat(64), agents: ["copilot"], scope: "user" },
    });
  });

  it("adds an agent to the same version rather than replacing it", async () => {
    const { recordInstall, readLedger } = await import("./ledger.js");
    await recordInstall({ ...base, version: "0.16.2" });

    await recordInstall({ ...base, version: "0.16.2", agents: ["claude"] });

    const ledger = await readLedger();
    expect(ledger.items["plugin:vu3-agent-kit"]!.agents).toEqual(["claude", "copilot"]);
  });

  // The case the ledger exists for: an update must not leave the old version on
  // record, or the drift it is meant to expose becomes invisible again.
  it("a new version replaces the record, agents included", async () => {
    const { recordInstall, readLedger } = await import("./ledger.js");
    await recordInstall({ ...base, version: "0.16.2", agents: ["claude", "copilot"] });

    await recordInstall({ ...base, version: "0.16.3", agents: ["copilot"] });

    const entry = (await readLedger()).items["plugin:vu3-agent-kit"]!;
    expect(entry.version).toBe("0.16.3");
    expect(entry.agents).toEqual(["copilot"]);
  });

  it("forgets only the agents an item was removed from", async () => {
    const { recordInstall, recordRemoval, readLedger } = await import("./ledger.js");
    await recordInstall({ ...base, version: "0.16.2", agents: ["claude", "copilot", "opencode"] });

    await recordRemoval("plugin", "vu3-agent-kit", ["copilot"]);

    expect((await readLedger()).items["plugin:vu3-agent-kit"]!.agents).toEqual(["claude", "opencode"]);
  });

  it("drops the item once no agent has it", async () => {
    const { recordInstall, recordRemoval, readLedger } = await import("./ledger.js");
    await recordInstall({ ...base, version: "0.16.2", agents: ["copilot"] });

    await recordRemoval("plugin", "vu3-agent-kit", ["copilot"]);

    expect((await readLedger()).items).toEqual({});
  });

  it("reads as empty when nothing was ever installed", async () => {
    const { readLedger } = await import("./ledger.js");
    expect(await readLedger()).toEqual({ version: 1, items: {} });
  });

  it("removing something never recorded is not an error", async () => {
    const { recordRemoval, readLedger } = await import("./ledger.js");
    await expect(recordRemoval("skill", "never-installed", ["claude"])).resolves.toBeUndefined();
    expect((await readLedger()).items).toEqual({});
  });
});

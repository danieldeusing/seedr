import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { readJson, writeJson, deepMerge, mergeJsonField, removeJsonFieldKey } from "./json.js";

const DIR_SETTINGS = "/dir/settings.json";
const VICTIM_JSON = "/outside/victim.json";

const CONFIG_PATH = "/config.json";

// Mock fs/promises with memfs
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

describe("json utilities", () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
  });

  describe("deepMerge", () => {
    it("should merge flat objects", () => {
      const target = { a: 1, b: 2, c: 0 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should deep merge nested objects", () => {
      type Target = { a: { x: number; y: number; z?: number }; b: number };
      const target: Target = { a: { x: 1, y: 2 }, b: 1 };
      const source: Partial<Target> = { a: { x: 1, y: 3, z: 4 } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: { x: 1, y: 3, z: 4 }, b: 1 });
    });

    it("should replace arrays instead of merging", () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);
      expect(result).toEqual({ arr: [4, 5] });
    });

    it("should not mutate the original target", () => {
      const target = { a: 1, b: 0 };
      const source = { b: 2 };
      deepMerge(target, source);
      expect(target).toEqual({ a: 1, b: 0 });
    });

    it("should handle null values", () => {
      const target = { a: { b: 1 } };
      const source = { a: null as unknown as { b: number } };
      const result = deepMerge(target, source);
      expect(result).toEqual({ a: null });
    });
  });

  describe("readJson", () => {
    it("should return empty object for non-existent file", async () => {
      const result = await readJson("/nonexistent.json");
      expect(result).toEqual({});
    });

    it("should parse existing JSON file", async () => {
      vol.fromJSON({
        "/test.json": JSON.stringify({ key: "value" }),
      });
      const result = await readJson("/test.json");
      expect(result).toEqual({ key: "value" });
    });

    it("names the malformed file and keeps the parse error as the cause", async () => {
      vol.fromJSON({ "/broken.json": "{not json" });
      // Seven config files reach readJson; the bare SyntaxError named none of them.
      await expect(readJson("/broken.json")).rejects.toThrow(/\/broken\.json is not valid JSON/);
      await expect(readJson("/broken.json")).rejects.toHaveProperty("cause.name", "SyntaxError");
    });
  });

  describe("writeJson", () => {
    it("should write JSON with pretty formatting", async () => {
      await writeJson("/output.json", { key: "value" });
      const content = vol.readFileSync("/output.json", "utf-8");
      expect(content).toBe('{\n  "key": "value"\n}\n');
    });

    it("should create parent directories if needed", async () => {
      await writeJson("/deep/nested/output.json", { key: "value" });
      expect(vol.existsSync("/deep/nested/output.json")).toBe(true);
    });

    it("writes atomically: no temp file remains and an existing file keeps its mode", async () => {
      vol.mkdirSync("/dir", { recursive: true });
      vol.writeFileSync(DIR_SETTINGS, "{}", { mode: 0o600 });
      await writeJson(DIR_SETTINGS, { replaced: true });
      expect(vol.readdirSync("/dir")).toEqual(["settings.json"]);
      expect(vol.statSync(DIR_SETTINGS).mode & 0o777).toBe(0o600);
      expect(JSON.parse(vol.readFileSync(DIR_SETTINGS, "utf-8") as string)).toEqual({ replaced: true });
    });

    it("leaves the previous document intact when the rename fails", async () => {
      vol.mkdirSync("/dir", { recursive: true });
      vol.writeFileSync(DIR_SETTINGS, '{"old":true}');
      const fsp = await import("node:fs/promises");
      const renameSpy = vi.spyOn(fsp, "rename").mockRejectedValueOnce(new Error("ENOSPC"));
      await expect(writeJson(DIR_SETTINGS, { next: true })).rejects.toThrow("ENOSPC");
      renameSpy.mockRestore();
      expect(vol.readFileSync(DIR_SETTINGS, "utf-8")).toBe('{"old":true}');
      expect(vol.readdirSync("/dir")).toEqual(["settings.json"]);
    });

    it("replaces a symlinked target instead of writing through it", async () => {
      vol.mkdirSync("/dir", { recursive: true });
      vol.mkdirSync("/outside", { recursive: true });
      vol.writeFileSync(VICTIM_JSON, '{"victim":true}');
      vol.symlinkSync(VICTIM_JSON, DIR_SETTINGS);
      await writeJson(DIR_SETTINGS, { safe: true });
      expect(vol.readFileSync(VICTIM_JSON, "utf-8")).toBe('{"victim":true}');
      expect(vol.lstatSync(DIR_SETTINGS).isSymbolicLink()).toBe(false);
    });
  });

  describe("mergeJsonField", () => {
    it("should merge into a specific field", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({ existing: true }),
      });
      await mergeJsonField(CONFIG_PATH, "hooks", { preCommit: "lint" });
      const result = JSON.parse(vol.readFileSync(CONFIG_PATH, "utf-8") as string);
      expect(result).toEqual({
        existing: true,
        hooks: { preCommit: "lint" },
      });
    });

    it("should merge with existing field data", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({
          hooks: { existing: "hook" },
        }),
      });
      await mergeJsonField(CONFIG_PATH, "hooks", { new: "hook" });
      const result = JSON.parse(vol.readFileSync(CONFIG_PATH, "utf-8") as string);
      expect(result).toEqual({
        hooks: { existing: "hook", new: "hook" },
      });
    });

    it("should merge at root level when no field specified", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({ a: 1 }),
      });
      await mergeJsonField(CONFIG_PATH, "", { b: 2 });
      const result = JSON.parse(vol.readFileSync(CONFIG_PATH, "utf-8") as string);
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it("should create file if it doesn't exist", async () => {
      await mergeJsonField("/new.json", "field", { key: "value" });
      expect(vol.existsSync("/new.json")).toBe(true);
      const result = JSON.parse(vol.readFileSync("/new.json", "utf-8") as string);
      expect(result).toEqual({ field: { key: "value" } });
    });
  });

  describe("removeJsonFieldKey", () => {
    it("should remove a key from a field", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({
          hooks: { a: 1, b: 2 },
        }),
      });
      const result = await removeJsonFieldKey(CONFIG_PATH, "hooks", "a");
      expect(result).toBe(true);
      const content = JSON.parse(vol.readFileSync(CONFIG_PATH, "utf-8") as string);
      expect(content).toEqual({ hooks: { b: 2 } });
    });

    it("should return false for non-existent file", async () => {
      const result = await removeJsonFieldKey("/nonexistent.json", "field", "key");
      expect(result).toBe(false);
    });

    it("should return false for non-existent key", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({ hooks: { a: 1 } }),
      });
      const result = await removeJsonFieldKey(CONFIG_PATH, "hooks", "nonexistent");
      expect(result).toBe(false);
    });

    it("should return false if field is not an object", async () => {
      vol.fromJSON({
        [CONFIG_PATH]: JSON.stringify({ hooks: "not an object" }),
      });
      const result = await removeJsonFieldKey(CONFIG_PATH, "hooks", "key");
      expect(result).toBe(false);
    });
  });
});

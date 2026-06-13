import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { vol } from "memfs";
import { readJson, writeJson, deepMerge, mergeJsonField, removeJsonFieldKey } from "./json.js";

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
  });

  describe("mergeJsonField", () => {
    it("should merge into a specific field", async () => {
      vol.fromJSON({
        "/config.json": JSON.stringify({ existing: true }),
      });
      await mergeJsonField("/config.json", "hooks", { preCommit: "lint" });
      const result = JSON.parse(vol.readFileSync("/config.json", "utf-8") as string);
      expect(result).toEqual({
        existing: true,
        hooks: { preCommit: "lint" },
      });
    });

    it("should merge with existing field data", async () => {
      vol.fromJSON({
        "/config.json": JSON.stringify({
          hooks: { existing: "hook" },
        }),
      });
      await mergeJsonField("/config.json", "hooks", { new: "hook" });
      const result = JSON.parse(vol.readFileSync("/config.json", "utf-8") as string);
      expect(result).toEqual({
        hooks: { existing: "hook", new: "hook" },
      });
    });

    it("should merge at root level when no field specified", async () => {
      vol.fromJSON({
        "/config.json": JSON.stringify({ a: 1 }),
      });
      await mergeJsonField("/config.json", "", { b: 2 });
      const result = JSON.parse(vol.readFileSync("/config.json", "utf-8") as string);
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
        "/config.json": JSON.stringify({
          hooks: { a: 1, b: 2 },
        }),
      });
      const result = await removeJsonFieldKey("/config.json", "hooks", "a");
      expect(result).toBe(true);
      const content = JSON.parse(vol.readFileSync("/config.json", "utf-8") as string);
      expect(content).toEqual({ hooks: { b: 2 } });
    });

    it("should return false for non-existent file", async () => {
      const result = await removeJsonFieldKey("/nonexistent.json", "field", "key");
      expect(result).toBe(false);
    });

    it("should return false for non-existent key", async () => {
      vol.fromJSON({
        "/config.json": JSON.stringify({ hooks: { a: 1 } }),
      });
      const result = await removeJsonFieldKey("/config.json", "hooks", "nonexistent");
      expect(result).toBe(false);
    });

    it("should return false if field is not an object", async () => {
      vol.fromJSON({
        "/config.json": JSON.stringify({ hooks: "not an object" }),
      });
      const result = await removeJsonFieldKey("/config.json", "hooks", "key");
      expect(result).toBe(false);
    });
  });
});

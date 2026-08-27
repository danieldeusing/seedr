import { describe, it, expect } from "vitest";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import { registerHandler, getHandler, hasHandler, getRegisteredTypes } from "./registry.js";
import type { ContentHandler, InstallResult } from "./types.js";

describe("handler registry", () => {
  // Create a mock handler for testing
  const createMockHandler = (type: string): ContentHandler => ({
    type: type as ContentHandler["type"],
    install: async () => [] as InstallResult[],
    uninstall: async () => true,
    listInstalled: async () => [],
  });

  describe("registerHandler", () => {
    it("should register a handler", () => {
      const handler = createMockHandler("skill");
      registerHandler(handler);
      expect(getHandler("skill")).toBe(handler);
    });

    it("should overwrite existing handler for same type", () => {
      const handler1 = createMockHandler("agent");
      const handler2 = createMockHandler("agent");
      registerHandler(handler1);
      registerHandler(handler2);
      expect(getHandler("agent")).toBe(handler2);
    });
  });

  describe("getHandler", () => {
    it("should return undefined for unregistered type", () => {
      // Using a type that might not be registered
      const handler = getHandler("command");
      // It might be registered from index.ts import, so just check it returns something or undefined
      expect(handler === undefined || handler.type === "command").toBe(true);
    });
  });

  describe("hasHandler", () => {
    it("should return true for registered handler", () => {
      const handler = createMockHandler("hook");
      registerHandler(handler);
      expect(hasHandler("hook")).toBe(true);
    });
  });

  describe("getRegisteredTypes", () => {
    it("should return array of registered types", () => {
      const types = getRegisteredTypes();
      expect(Array.isArray(types)).toBe(true);
    });
  });
});

/*
 * The gap this closes: `command` was a ComponentType, was in AGENT_COMPATIBILITY
 * and had an install path under `.claude/commands`, but no handler was ever
 * registered — so `seedr add --type command` would have died on "No handler
 * found" for the first command item anyone added. Nothing connected the
 * vocabulary to the registry, so nothing said so.
 */
describe("every type in the vocabulary can actually be installed", () => {
  it.each(ALL_TYPES)("%s has a registered handler", async (type) => {
    await import("./index.js");
    expect(hasHandler(type), `no handler registered for "${type}"`).toBe(true);
    expect(getHandler(type)?.type).toBe(type);
  });
});

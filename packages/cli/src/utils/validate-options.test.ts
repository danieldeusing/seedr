import { describe, it, expect } from "vitest";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import { AGENT_COMPATIBILITY } from "../config/compatibility.js";
import { validateType, validateScope, validateMethod, TYPE_LIST } from "./validate-options.js";

/**
 * These are drift guards, not behaviour tests.
 *
 * The CLI once kept its own hand-written copy of the type list, so `--type rule`
 * was refused while the registry, the handlers, the validator and the compiler
 * had all already accepted it. Every unit test passed, because unit tests call
 * handlers directly and never cross the CLI's option gate. Only a real install
 * found it.
 */
describe("the type vocabulary is one list", () => {
  it("accepts every type the registry knows about", () => {
    for (const type of ALL_TYPES) {
      expect(validateType(type), `validateType rejected "${type}"`).toBeNull();
    }
  });

  it("names every type in the help string", () => {
    for (const type of ALL_TYPES) {
      expect(TYPE_LIST).toContain(type);
    }
  });

  it("gives every type a compatibility row naming at least one agent", () => {
    for (const type of ALL_TYPES) {
      expect(AGENT_COMPATIBILITY[type], `no compatibility row for "${type}"`).toBeDefined();
      expect(AGENT_COMPATIBILITY[type].length, `"${type}" is installable nowhere`).toBeGreaterThan(0);
    }
  });

  it("has a handler registered for every type", async () => {
    // Importing the barrel is what registers them.
    const { getRegisteredTypes } = await import("../handlers/index.js");
    const registered = new Set(getRegisteredTypes());
    for (const type of ALL_TYPES) {
      expect(registered.has(type), `no handler registered for "${type}"`).toBe(true);
    }
  });

  it("rejects a type nobody defines", () => {
    expect(validateType("nonsense")).toMatch(/Invalid type/);
  });
});

describe("scope and method", () => {
  it("accepts the documented values and rejects anything else", () => {
    for (const scope of ["project", "user", "local"]) expect(validateScope(scope)).toBeNull();
    for (const method of ["symlink", "copy"]) expect(validateMethod(method)).toBeNull();
    expect(validateScope("global")).toMatch(/Invalid scope/);
    expect(validateMethod("hardlink")).toMatch(/Invalid method/);
  });

  it("treats an unset option as valid", () => {
    expect(validateType(undefined)).toBeNull();
    expect(validateScope(undefined)).toBeNull();
    expect(validateMethod(undefined)).toBeNull();
  });
});

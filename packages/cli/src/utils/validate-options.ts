import type { ComponentType } from "@seedr/shared";
import { ALL_TYPES } from "@seedr/registry-ops/pure";
import type { InstallScope, InstallMethod } from "../types.js";

const SCOPES: InstallScope[] = ["project", "user", "local"];
const METHODS: InstallMethod[] = ["symlink", "copy"];

/**
 * Derived, never listed by hand. A second copy of this list silently rejected
 * a type the registry, the handlers and the compiler all already knew about —
 * the CLI refused `--type rule` while every unit test passed, because the tests
 * call handlers directly and never cross this gate.
 */
const TYPES: readonly ComponentType[] = ALL_TYPES;

/** For help strings, so they cannot drift from what is actually installable. */
export const TYPE_LIST = TYPES.join(", ");

/**
 * Validate a CLI option value against its allowed literals. Returns an error
 * message string when the value is invalid, or null when it is valid or unset.
 */
export function validateScope(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!SCOPES.includes(value as InstallScope)) {
    return `Invalid scope "${value}". Must be one of: ${SCOPES.join(", ")}`;
  }
  return null;
}

export function validateMethod(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!METHODS.includes(value as InstallMethod)) {
    return `Invalid method "${value}". Must be one of: ${METHODS.join(", ")}`;
  }
  return null;
}

export function validateType(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!TYPES.includes(value as ComponentType)) {
    return `Invalid type "${value}". Must be one of: ${TYPES.join(", ")}`;
  }
  return null;
}

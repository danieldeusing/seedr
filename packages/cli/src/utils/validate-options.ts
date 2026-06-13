import type { ComponentType } from "@seedr/shared";
import type { InstallScope, InstallMethod } from "../types.js";

const SCOPES: InstallScope[] = ["project", "user", "local"];
const METHODS: InstallMethod[] = ["symlink", "copy"];
const TYPES: ComponentType[] = [
  "skill",
  "hook",
  "agent",
  "plugin",
  "command",
  "settings",
  "mcp",
];

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

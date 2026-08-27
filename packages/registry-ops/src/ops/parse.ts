import { isComponentType, isValidSlug } from "../paths.js";
import { CANONICAL_SOURCE_TYPES } from "../sourceTypes.js";
import type { RegistryOp } from "./types.js";

type Envelope = Record<string, unknown>;

const isRecord = (value: unknown): value is Envelope =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fail(message: string): never {
  throw new Error(`Invalid operation: ${message}`);
}

function requireString(op: Envelope, field: string): void {
  if (typeof op[field] !== "string" || op[field] === "") fail(`"${field}" must be a non-empty string`);
}

/** Every operation on one item is keyed by (type, slug); the catalogue operation is not. */
function requireItemKey(op: Envelope): void {
  if (!isComponentType(op.type)) fail(`unknown type ${JSON.stringify(op.type)}`);
  if (!isValidSlug(op.slug)) fail(`invalid slug ${JSON.stringify(op.slug)}`);
}

function requireItemFields(op: Envelope): void {
  requireString(op, "name");
  if (!Array.isArray(op.compatibility)) fail('"compatibility" must be an array');
  if (!isRecord(op.author)) fail('"author" must be an object');
}

function checkUpdate(op: Envelope): void {
  requireItemKey(op);
  requireString(op, "expectedHash");
  if (!isRecord(op.patch)) fail('"patch" must be an object');
  for (const locked of ["slug", "type", "sourceType", "contentHash"]) {
    if (locked in op.patch) fail(`"patch" may not change "${locked}"`);
  }
  if (op.contentEdits === undefined) return;
  if (!Array.isArray(op.contentEdits)) fail('"contentEdits" must be an array');
  for (const edit of op.contentEdits) {
    if (!isRecord(edit) || typeof edit.path !== "string" || typeof edit.content !== "string") {
      fail('each content edit needs a string "path" and "content"');
    }
  }
}

const CHECKS: Record<string, (op: Envelope) => void> = {
  "add-local": (op) => {
    requireItemKey(op);
    requireString(op, "sourcePath");
    requireItemFields(op);
  },
  "add-remote": (op) => {
    requireItemKey(op);
    requireString(op, "externalUrl");
    requireString(op, "sourceRevision");
    requireString(op, "contentDigest");
    requireItemFields(op);
  },
  update: checkUpdate,
  remove: (op) => {
    requireItemKey(op);
    requireString(op, "expectedHash");
    if (!(CANONICAL_SOURCE_TYPES as readonly string[]).includes(String(op.sourceType))) {
      fail(`unknown sourceType ${JSON.stringify(op.sourceType)}`);
    }
  },
  // The entries themselves are checked by parseLabels when the operation is applied,
  // against the same catalogue file it will be read back from.
  "set-labels": (op) => {
    if (!Array.isArray(op.labels)) fail('"labels" must be an array');
  },
  "adopt-source": (op) => {
    requireItemKey(op);
    requireString(op, "expectedHash");
  },
  "resync-source": (op) => {
    requireItemKey(op);
    requireString(op, "expectedHash");
  },
};

/**
 * Accept only a well-formed v1 operation. Field-level validity of the item it
 * produces is the validator's job; this guards the envelope, so a malformed or
 * hostile payload is refused by shape rather than discovered mid-apply.
 */
export function parseOp(value: unknown): RegistryOp {
  if (!isRecord(value)) fail("must be a JSON object");
  if (value.v !== 1) fail(`unsupported version ${JSON.stringify(value.v)} (expected 1)`);
  const check = typeof value.kind === "string" ? CHECKS[value.kind] : undefined;
  if (!check) fail(`unknown kind ${JSON.stringify(value.kind)}`);
  check(value);
  return value as unknown as RegistryOp;
}

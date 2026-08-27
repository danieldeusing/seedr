/**
 * The part of registry-ops that needs no filesystem: path derivation, the
 * validator and the operation types. Seedr Studio's webview imports this entry
 * so the one implementation of "where does an item live" and "what is a valid
 * item" also runs in the browser, where `node:fs` does not exist.
 */
export * from "./paths.js";
export * from "./agents.js";
export * from "./sourceTypes.js";
export * from "./labels.js";
export * from "./validate.js";
export * from "./ops/types.js";
export * from "./sourceShape.js";
export * from "./sourceState.js";
export { parseOp } from "./ops/parse.js";

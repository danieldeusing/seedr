#!/usr/bin/env node
/**
 * PostToolUse hook: recompile the registry manifests after an item.json edit.
 *
 * The manifest.json files are generated from each registry/<type>/<slug>/item.json
 * (see .agents/rules/registry-structure.md). Editing an item.json without running
 * `pnpm compile` leaves the manifests stale, which the web app and CLI then serve.
 * This hook closes that gap whenever an item.json is written through an agent's
 * edit tool. It does not fire on shell copies or deletions — run `pnpm compile`
 * yourself after those.
 *
 * Reads the PostToolUse payload on stdin, acts only when the edited path is a
 * registry item.json, and is a no-op for every other file. Node rather than
 * bash + jq so it runs on Windows too.
 */
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let payload = "";
for await (const chunk of process.stdin) payload += chunk;

let filePath = "";
try {
  filePath = JSON.parse(payload)?.tool_input?.file_path ?? "";
} catch {
  // Not a JSON payload: nothing to do.
}

const isRegistryItem = /[\\/]registry[\\/][^\\/]+[\\/][^\\/]+[\\/]item\.json$/.test(filePath);
if (isRegistryItem) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // A constant command string through the shell: pnpm is a .cmd shim on Windows,
  // which spawn cannot run without one.
  const result = spawnSync("pnpm compile", { cwd, encoding: "utf8", shell: true });
  if (result.status === 0) {
    console.log("Recompiled registry manifests (item.json changed).");
  } else {
    const log = join(tmpdir(), "seedr-compile.log");
    writeFileSync(log, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    console.error(`pnpm compile failed after editing ${filePath} — see ${log}`);
    process.exit(2);
  }
}

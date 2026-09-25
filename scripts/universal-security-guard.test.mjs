import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "../registry/hooks/universal-security-guard/universal-security-guard.sh");
const AT_BATCH = "BLOCKED: Job scheduling via at/batch";

/** The hook's deny reason for one Bash command, or null when it defers to the normal permission flow. */
function denyReason(command) {
  const input = JSON.stringify({ tool_name: "Bash", tool_input: { command } });
  const output = execFileSync("bash", [HOOK], { input, encoding: "utf8" });
  return output ? JSON.parse(output).hookSpecificOutput.permissionDecisionReason : null;
}

describe("universal-security-guard: at/batch job scheduling", { skip: process.platform === "win32" && "bash hook" }, () => {
  const scheduling = [
    "at now + 1 minute",
    "echo cmd | at 10:00",
    "at -f script.sh noon",
    "batch",
    "batch < jobs.txt",
    "/usr/bin/batch < jobs.txt",
    "ls && at midnight",
    "echo `at now`",
    "x=$(at now + 1 minute)",
    'echo "$(at now + 1 minute)"',
    "env at now",
  ];
  for (const command of scheduling) {
    test(`denies ${command}`, () => assert.equal(denyReason(command), AT_BATCH));
  }

  const notScheduling = [
    'grep -e "at a glance" f',
    'grep -E "summary|at a glance" f',
    "echo look at this",
    "git log --grep batch",
    "grep -n 'batch' src/index.ts",
    'git commit -m "flush; at least once"',
    'git commit -m "first line\nat the end"',
    "cat notes.txt",
    "echo format",
    "ls batches",
  ];
  for (const command of notScheduling) {
    test(`defers ${JSON.stringify(command)}`, () => assert.equal(denyReason(command), null));
  }
});

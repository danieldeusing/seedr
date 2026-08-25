import { describe, expect, test } from "vitest";
import type { RunOutcome } from "@/api/agent";
import { CANONICAL_AGENTS } from "@seedr/registry-ops/pure";
import { adapterFor, summariseInput } from "./adapters";

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({ taskId: "t", status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...over });

describe("adapters", () => {
  test("every canonical agent can be driven, each in its own spelling", () => {
    for (const agent of CANONICAL_AGENTS) {
      const adapter = adapterFor(agent);
      expect(adapter.program).toBeTruthy();
      // Non-interactive, always: no adapter may open a terminal session.
      const job = adapter.jobArgs(["Read"]).join(" ");
      expect(job).toMatch(/-p\b|exec|run/);
      expect(adapter.draftArgs().join(" ")).toMatch(/-p\b|exec|run/);
    }
  });

  test("the tool boundary is spelled the way each CLI spells it", () => {
    expect(adapterFor("claude").draftArgs()).toEqual(expect.arrayContaining(["--tools", "", "--max-turns", "1"]));
    expect(adapterFor("claude").jobArgs(["Read", "Bash(git:*)"]).at(-1)).toBe("Read,Bash(git:*)");
    // Copilot allows tools one flag at a time, and takes the prompt on argv.
    expect(adapterFor("copilot").jobArgs(["Read", "Edit"])).toEqual(expect.arrayContaining(["--allow-tool", "Read", "--allow-tool", "Edit"]));
    expect(adapterFor("copilot").promptOnStdin).toBe(false);
    expect(adapterFor("copilot").jobArgs([]).at(-1)).toBe("-p");
    // Codex has no allowlist: its sandbox is the boundary, read-only for a draft.
    expect(adapterFor("codex").draftArgs()).toEqual(expect.arrayContaining(["-s", "read-only"]));
    expect(adapterFor("codex").jobArgs([])).toEqual(expect.arrayContaining(["-s", "workspace-write"]));
    // Antigravity has no allowlist either; plan mode is what cannot write.
    expect(adapterFor("antigravity").draftArgs()).toEqual(expect.arrayContaining(["--mode", "plan"]));
    expect(adapterFor("antigravity").jobArgs([])).toEqual(expect.arrayContaining(["--mode", "accept-edits"]));
  });

  test("a draft asks for a schema wherever the CLI can enforce one", () => {
    for (const agent of ["claude", "antigravity"] as const) {
      const args = adapterFor(agent).draftArgs();
      expect(args).toContain("--json-schema");
      expect(JSON.parse(args[args.indexOf("--json-schema") + 1] ?? "{}")).toMatchObject({ type: "object" });
    }
    // The others answer as text; the same validator judges what comes back.
    for (const agent of ["copilot", "codex", "opencode"] as const) {
      expect(adapterFor(agent).draftArgs()).not.toContain("--json-schema");
    }
  });

  test("Claude-style streams read as turns; plain agents read as lines", () => {
    const claude = adapterFor("claude");
    expect(claude.readLine(JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "a.ts" } }] } }))).toEqual([{ kind: "tool", text: "Read a.ts" }]);
    expect(claude.readOutcome(outcome({ stdout: JSON.stringify({ type: "result", is_error: false, result: "done" }) }))).toEqual({ ok: true, text: "done", denials: [] });

    const codex = adapterFor("codex");
    expect(codex.readLine("thinking about it")).toEqual([{ kind: "text", text: "thinking about it" }]);
    expect(codex.readLine("   ")).toEqual([]);
    expect(codex.readOutcome(outcome({ stdout: "all done\n" }))).toEqual({ ok: true, text: "all done", denials: [] });
    expect(codex.readOutcome(outcome({ status: "failed", exitCode: 1, stderr: "nope" }))).toEqual({ ok: false, text: "nope", denials: [] });
  });

  test("a tool call is named by its most telling argument", () => {
    expect(summariseInput({ command: "git status" })).toBe("git status");
    expect(summariseInput({ nothing: 1 })).toBe("");
    expect(summariseInput(null)).toBe("");
    expect(summariseInput({ path: "x".repeat(200) })).toHaveLength(118);
  });
});

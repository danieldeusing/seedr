import { describe, expect, test, vi } from "vitest";
import type { RunRequest } from "@/api/agent";
import { probeAdapters } from "./adapters";

describe("probeAdapters", () => {
  test("certifies only Claude; other installed agents are reported but not offered", async () => {
    const run = vi.fn(async (request: RunRequest) => {
      const base = { taskId: request.taskId, exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
      if (request.program === "claude") return { ...base, status: "ok" as const, stdout: request.args[0] === "--version" ? "2.1.226 (Claude Code)" : "--output-format --json-schema --max-turns" };
      if (request.program === "codex") return { ...base, status: "ok" as const, stdout: "codex-cli 0.147.0" };
      if (request.program === "agy") return { ...base, status: "not-found" as const };
      return { ...base, status: "ok" as const, stdout: "1.18.16" };
    });

    const statuses = await probeAdapters(run);

    expect(statuses.map((s) => [s.id, s.certified, s.available])).toEqual([
      ["claude", true, true],
      ["copilot", false, false],
      ["codex", false, false],
      ["antigravity", false, false],
      ["opencode", false, false],
    ]);
    expect(statuses.find((s) => s.id === "codex")?.diagnostic).toBe("OpenAI Codex 0.147.0 is installed but not certified for Studio yet");
    expect(statuses.find((s) => s.id === "antigravity")?.diagnostic).toMatch(/not installed/);
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RunOutcome } from "@/api/agent";
import { modelsFor, useModels } from "./models";
import { modelFor, useJobModels } from "./jobModels";

const ok = (stdout: string): RunOutcome => ({ taskId: "t", status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
const failed = (stderr: string): RunOutcome => ({ taskId: "t", status: "failed", exitCode: 1, stdout: "", stderr, durationMs: 1 });

beforeEach(() => {
  localStorage.clear();
  useModels.setState({ byAgent: {}, probing: null });
  useJobModels.setState({ chosen: {}, root: "" });
});

describe("what each CLI can be given", () => {
  test("claude: the table's ids, and not the ones its prose mentions", async () => {
    // The output ends with notes — "never append a date suffix
    // (`claude-sonnet-5-20251114`)", and a model that is not generally
    // available. Only the table lists what can be run.
    const out = [
      "Current Claude models (cached 2026-06-24):",
      "| Model | Model ID | Context |",
      "| --- | --- | --- |",
      "| Claude Opus 5 | `claude-opus-5` | 1M |",
      "| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K |",
      "",
      "- IDs are complete as written. Never append a date suffix (`claude-sonnet-5-20251114`).",
      "- `claude-mythos-5` exists at Fable 5 pricing but is Project Glasswing only.",
    ].join("\n");

    await useModels.getState().probe("claude", vi.fn(async () => ok(out)));

    expect(modelsFor("claude").models).toEqual(["claude-opus-5", "claude-haiku-4-5"]);
  });

  test("codex: JSON, without the models it hides from its own picker", async () => {
    const out = JSON.stringify({
      models: [
        { slug: "gpt-5.6-sol", visibility: "show" },
        { slug: "codex-auto-review", visibility: "hide" },
        { slug: "gpt-5-mini" },
      ],
    });

    await useModels.getState().probe("codex", vi.fn(async () => ok(out)));

    expect(modelsFor("codex").models).toEqual(["gpt-5.6-sol", "gpt-5-mini"]);
  });

  test("antigravity: the id before the tab, past its progress line", async () => {
    const out = "Fetching available models...\ngemini-3.7-flash-high\tGemini 3.7 Flash (High)\ngemini-3.1-pro\tGemini 3.1 Pro\n";

    await useModels.getState().probe("antigravity", vi.fn(async () => ok(out)));

    expect(modelsFor("antigravity").models).toEqual(["gemini-3.7-flash-high", "gemini-3.1-pro"]);
  });

  test("copilot: the last line of the bundled SDK's answer", async () => {
    await useModels.getState().probe("copilot", vi.fn(async () => ok('{"models":["auto","claude-opus-5"]}\n')));
    expect(modelsFor("copilot").models).toEqual(["auto", "claude-opus-5"]);
  });

  test("a CLI that does not answer leaves an empty list and says why", async () => {
    // Never an invented value, and never an empty list with no reason: a
    // hardcoded catalogue would be wrong within weeks and wrong silently.
    await useModels.getState().probe("opencode", vi.fn(async () => failed("opencode: not signed in")));

    expect(modelsFor("opencode")).toMatchObject({ models: [], error: "opencode: not signed in" });
  });

  test("the answer survives a reload, since the CLI is the machine's not the checkout's", async () => {
    await useModels.getState().probe("codex", vi.fn(async () => ok('{"models":[{"slug":"gpt-5-mini"}]}')));
    expect(JSON.parse(localStorage.getItem("studio-model-catalogue") ?? "{}").codex.models).toEqual(["gpt-5-mini"]);
  });
});

describe("which model a job runs on", () => {
  test("is per job and per agent, and empty means the CLI's default", () => {
    const { forRepo, set } = useJobModels.getState();
    forRepo("/repo/seedr");

    set("claude", "add", "claude-opus-5");
    set("claude", "publish", "claude-haiku-4-5");

    expect(modelFor("claude", "add")).toBe("claude-opus-5");
    expect(modelFor("claude", "publish")).toBe("claude-haiku-4-5");
    // Untouched, so the CLI decides.
    expect(modelFor("claude", "update")).toBe("");
    // A model id belongs to one CLI: codex is never handed a claude model.
    expect(modelFor("codex", "add")).toBe("");
  });

  test("follows the checkout, like the author and the pre-prompts", () => {
    const { forRepo, set } = useJobModels.getState();
    forRepo("/repo/seedr");
    set("claude", "add", "claude-opus-5");

    forRepo("/repo/fork");
    expect(modelFor("claude", "add")).toBe("");

    forRepo("/repo/seedr");
    expect(modelFor("claude", "add")).toBe("claude-opus-5");
  });
});

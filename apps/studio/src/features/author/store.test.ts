import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { emit, invoke, onCommand } from "@/test/mockIpc";
import { emptyPrePrompts, usePrePrompts } from "@/features/settings/prePrompts";
import { DENIED_SHELL } from "./adapters";
import { ADD_JOB_CAPABILITIES, emptyForm, formProblems, githubProblem, jobPrompt, parseAdded, toOp, useAuthor } from "./store";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);
const HELP = "--output-format --json-schema --tools";
const PROBE_OK = { available: true, version: "2.1.226", diagnostic: null };

/** Scripts the host's `run_process` by program+args, recording every request. */
function scriptHost(answers: Record<string, (request: RunRequest) => Partial<import("@/api/agent").RunOutcome>>) {
  const requests: RunRequest[] = [];
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    requests.push(request);
    const key = `${request.program} ${request.args[0]} ${request.args[1] ?? ""}`.trim();
    const answer = Object.entries(answers).find(([pattern]) => key.startsWith(pattern))?.[1];
    return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1, ...(answer ? answer(request) : { status: "failed", stderr: `unscripted: ${key}` }) };
  });
  return requests;
}

const identity = { owner: "acme", repo: "seedr", defaultBranch: "main", authorName: "Acme Bot", remoteUrl: "x", externalUrlTemplate: null };
const draftEnvelope = JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { description: "Fills PDF forms.", longDescription: LONG } });

beforeEach(() => {
  useAuthor.getState().reset();
  onCommand("cancel_process", () => true);
});

describe("toOp / formProblems", () => {
  test("builds the add-local op the CLI expects and reports what the validator would refuse", () => {
    const form = { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", description: "Fills forms.", longDescription: LONG, authorName: "Me", targetScope: "project" as const };
    expect(toOp(form)).toMatchObject({ v: 1, kind: "add-local", type: "skill", slug: "pdf", sourcePath: "/src/pdf", author: { name: "Me" }, targetScope: "project" });
    expect(toOp(form).externalUrl).toBeUndefined();
    expect(formProblems(form)).toEqual([]);

    const bad = { ...form, sourcePath: "", slug: "Bad Slug", longDescription: "short" };
    expect(formProblems(bad).map((p) => p.field)).toEqual(["sourcePath", "slug", "longDescription"]);
  });
});

describe("useAuthor", () => {
  test("prepare probes Claude and prefills the author from the repo identity", async () => {
    scriptHost({
      "claude --version": () => ({ stdout: "2.1.226 (Claude Code)" }),
      "claude --help": () => ({ stdout: HELP }),
      "npx tsx scripts/registry-op.ts": (request) => (request.args.includes("identity") ? { stdout: JSON.stringify(identity) } : {}),
    });
    await useAuthor.getState().prepare();
    const state = useAuthor.getState();
    expect(state.probe).toEqual(PROBE_OK);
    expect(state.form.authorName).toBe("Acme Bot");
    expect(state.form.authorUrl).toBe("https://github.com/acme");
  });

  test("chooseSource derives slug and name from the picked folder", async () => {
    onCommand("pick_path", () => "/Users/me/.claude/skills/fill-pdf_forms");
    await useAuthor.getState().chooseSource();
    expect(useAuthor.getState().form).toMatchObject({ sourcePath: "/Users/me/.claude/skills/fill-pdf_forms", slug: "fill-pdf_forms", name: "Fill Pdf Forms" });
  });

  test("draft reads the source through the host, asks Claude with the prompt on stdin, and fills the descriptions", async () => {
    useAuthor.setState({ probe: PROBE_OK, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" } });
    onCommand("read_source_files", () => ({ files: { "SKILL.md": "# PDF" }, skipped: [] }));
    const requests = scriptHost({ "claude -p": () => ({ stdout: draftEnvelope }) });

    await useAuthor.getState().draft();

    expect(useAuthor.getState().form.description).toBe("Fills PDF forms.");
    expect(useAuthor.getState().draftErrors).toEqual([]);
    expect(requests[0]?.stdin).toContain("### SKILL.md");
    expect(requests[0]?.args).toContain("--max-turns");
  });

  test("draft without an available agent or a source explains itself", async () => {
    useAuthor.setState({ probe: { available: false, version: null, diagnostic: "Claude Code is not installed" } });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().draftErrors).toEqual(["Claude Code is not installed"]);

    useAuthor.setState({ probe: PROBE_OK });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().draftErrors).toEqual(["choose the source first"]);
  });

  test("streamed agent output lands in the log while drafting", async () => {
    useAuthor.setState({ probe: PROBE_OK, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" } });
    onCommand("read_source_files", () => ({ files: {}, skipped: [] }));
    scriptHost({
      "claude -p": () => {
        emit("process-output", { taskId: "author-draft-0", stream: "stderr", line: "thinking…" });
        return { stdout: draftEnvelope };
      },
    });
    await useAuthor.getState().draft();
    expect(useAuthor.getState().log).toEqual(["thinking…"]);
  });

  test("apply refuses an invalid form, runs a valid one through the CLI transaction, and reports the result", async () => {
    await useAuthor.getState().apply();
    expect(useAuthor.getState().error).toMatch(/fix the highlighted fields/);

    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me", description: "Fills PDF forms.", longDescription: LONG } });
    const requests = scriptHost({
      "npx tsx scripts/registry-op.ts": () => ({
        stdout: JSON.stringify({ ok: true, kind: "add-local", type: "skill", slug: "pdf", item: {}, changedPaths: ["registry/skills/pdf/item.json"], headBefore: "abc1234def" }),
      }),
    });
    await useAuthor.getState().apply();

    expect(useAuthor.getState().phase).toBe("done");
    expect(useAuthor.getState().result).toMatchObject({ kind: "op", changedPaths: ["registry/skills/pdf/item.json"] });
    expect(requests[0]?.args).toEqual(["tsx", "scripts/registry-op.ts", "run", "--op", "-"]);
    expect(JSON.parse(requests[0]?.stdin ?? "{}")).toMatchObject({ v: 1, kind: "add-local", slug: "pdf" });
  });

  test("a refused transaction surfaces the CLI's reason and returns to idle", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me", description: "Fills PDF forms.", longDescription: LONG } });
    scriptHost({ "npx tsx scripts/registry-op.ts": () => ({ status: "failed", exitCode: 1, stderr: "registry-op: The worktree has uncommitted changes" }) });
    await useAuthor.getState().apply();
    expect(useAuthor.getState().phase).toBe("idle");
    expect(useAuthor.getState().error).toMatch(/uncommitted changes/);
  });

  test("cancel kills the draft's process ids", async () => {
    useAuthor.setState({ phase: "drafting" });
    await useAuthor.getState().cancel();
    expect(invoke).toHaveBeenCalledWith("cancel_process", { taskId: "author-draft-0" });
    expect(invoke).toHaveBeenCalledWith("cancel_process", { taskId: "author-draft-1" });
  });
});

describe("jobs — a repository or a prompt", () => {
  test("only github repositories are accepted, with an owner and a name", () => {
    expect(githubProblem("")).toBe("paste the repository's URL");
    expect(githubProblem("github.com/obra/superpowers")).toBe("not a URL");
    expect(githubProblem("http://github.com/obra/superpowers")).toBe("only https URLs are fetched");
    expect(githubProblem("https://gitlab.com/obra/superpowers")).toMatch(/github.com/);
    expect(githubProblem("https://github.com/obra")).toBe("name the owner and the repository");
    expect(githubProblem("https://github.com/obra/superpowers")).toBeNull();
    expect(githubProblem("https://github.com/obra/superpowers/tree/main/skills/x")).toBeNull();
  });

  test("what the form must have depends on where the capability comes from", () => {
    const repo = { ...emptyForm(), sourceKind: "repo" as const };
    expect(formProblems(repo).map((p) => p.field)).toEqual(["repoUrl"]);
    expect(formProblems({ ...repo, repoUrl: "https://github.com/obra/superpowers" })).toEqual([]);

    const agent = { ...emptyForm(), sourceKind: "agent" as const, prompt: "" };
    expect(formProblems(agent).map((p) => p.field)).toEqual(["prompt"]);
    expect(formProblems({ ...agent, prompt: "a skill that renames files" })).toEqual([]);
  });

  test("the job prompt names the repo's own skill, carries the hints and asks for the ADDED line", () => {
    const prompt = jobPrompt({ ...emptyForm(), sourceKind: "repo", repoUrl: "https://github.com/obra/superpowers ", prompt: "use the marketplace entry", slug: "superpowers" });
    expect(prompt).toContain("/add-community https://github.com/obra/superpowers");
    expect(prompt).toContain("use the marketplace entry");
    expect(prompt).toContain("slug: superpowers");
    expect(prompt).toContain("agents: claude");
    expect(prompt).toContain("registry-descriptions.md");
    expect(prompt).toContain("ADDED <type>/<slug>");
    expect(jobPrompt({ ...emptyForm(), sourceKind: "agent", prompt: "renames files" })).toContain("/add-seedr");
  });

  test("parseAdded takes only a known type", () => {
    expect(parseAdded("blah\nADDED skill/pdf")).toEqual({ type: "skill", slug: "pdf" });
    expect(parseAdded("ADDED nonsense/pdf")).toBeNull();
    expect(parseAdded("nothing here")).toBeNull();
  });

  test("a repository is handed to the agent, and what it added is selected", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourceKind: "repo", repoUrl: "https://github.com/obra/superpowers" }, probe: PROBE_OK });
    const requests = scriptHost({
      claude: () => ({ stdout: JSON.stringify({ type: "result", is_error: false, result: "Added it.\nADDED plugin/superpowers" }) }),
    });

    await useAuthor.getState().apply();

    expect(useAuthor.getState().phase).toBe("done");
    expect(useAuthor.getState().result).toMatchObject({ kind: "job", added: { type: "plugin", slug: "superpowers" } });
    const allowed = requests[0]?.args[requests[0].args.indexOf("--allowedTools") + 1];
    expect(allowed).toBe("Read,Write,Edit,Glob,Grep,Skill,WebFetch,Bash");
    // An open shell, and git denied alongside it.
    expect(requests[0]?.args).toEqual(expect.arrayContaining(["--disallowedTools", "Bash(git:*)"]));
  });

  test("a refused tool is named, and the run stays open for a retry", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourceKind: "agent", prompt: "a skill that renames files" }, probe: PROBE_OK });
    scriptHost({ claude: () => ({ stdout: JSON.stringify({ type: "result", is_error: true, result: "I could not run git", permission_denials: [{ tool_name: "Bash" }] }) }) });

    await useAuthor.getState().apply();

    expect(useAuthor.getState().phase).toBe("idle");
    expect(useAuthor.getState().error).toBe("I could not run git");
    expect(useAuthor.getState().draftErrors[0]).toMatch(/asked for Bash, which it is not allowed/);
  });

  test("without a working agent the job is refused before anything runs", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourceKind: "agent", prompt: "x" }, probe: { available: false, version: null, diagnostic: "Claude Code is not installed" } });
    await useAuthor.getState().apply();
    expect(useAuthor.getState().phase).toBe("idle");
    expect(useAuthor.getState().error).toBe("Claude Code is not installed");
  });

  test("cancel kills the job's process", async () => {
    useAuthor.setState({ phase: "running" });
    await useAuthor.getState().cancel();
    expect(invoke).toHaveBeenCalledWith("cancel_process", { taskId: "author-job" });
  });
});

describe("what an add job may run", () => {
  test("reads GitHub and runs the operations CLI, and nothing else", () => {
    // The add-community skill is written against `gh api`; without it every
    // repository job would fail on a denial.
    // Authoring runs the maintainer's own tooling, so the shell is open —
    // bounded by the one thing a job must never do.
    expect(ADD_JOB_CAPABILITIES).toContain("shell");
    expect(ADD_JOB_CAPABILITIES.some((capability: string) => capability.startsWith("shell:"))).toBe(false);
    expect(DENIED_SHELL).toBe("git");
    expect(jobPrompt({ ...emptyForm(), sourceKind: "repo", repoUrl: "https://github.com/o/r" })).toContain("never with -X");
  });
});

describe("descriptions left empty", () => {
  test("are drafted on submit rather than refused", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me" }, probe: PROBE_OK });
    expect(formProblems(useAuthor.getState().form)).toEqual([]);
    onCommand("read_source_files", () => ({ files: { "SKILL.md": "# PDF" }, skipped: [] }));
    const requests = scriptHost({
      claude: () => ({ stdout: draftEnvelope }),
      "npx tsx scripts/registry-op.ts": () => ({ stdout: JSON.stringify({ ok: true, kind: "add-local", type: "skill", slug: "pdf", item: {}, changedPaths: ["registry/skills/pdf/item.json"], headBefore: "abc1234" }) }),
    });

    await useAuthor.getState().apply();

    expect(requests.map((request) => request.program)).toEqual(["claude", "npx"]);
    expect(useAuthor.getState().phase).toBe("done");
    expect(JSON.parse(requests[1]?.stdin ?? "{}")).toMatchObject({ description: "Fills PDF forms." });
  });

  test("a failed draft stops the add and says why", async () => {
    useAuthor.setState({ form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me" }, probe: PROBE_OK });
    onCommand("read_source_files", () => ({ files: { "SKILL.md": "# PDF" }, skipped: [] }));
    const requests = scriptHost({ claude: () => ({ stdout: JSON.stringify({ type: "result", is_error: true, result: "rate limited" }) }) });

    await useAuthor.getState().apply();

    expect(requests.every((request) => request.program === "claude")).toBe(true);
    expect(useAuthor.getState().phase).toBe("idle");
    expect(useAuthor.getState().draftErrors[0]).toMatch(/rate limited/);
  });

  test("a description that is filled in but too short is still refused", () => {
    const form = { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF", authorName: "Me", description: "Fills forms.", longDescription: "too short" };
    expect(formProblems(form).map((p) => p.field)).toEqual(["longDescription"]);
  });
});

describe("the pre-prompt in the dialog", () => {
  test("is re-read when the dialog opens, and an edited one is left alone", async () => {
    scriptHost({
      "claude --version": () => ({ stdout: "2.1.226" }),
      "claude --help": () => ({ stdout: HELP }),
      "npx tsx scripts/registry-op.ts": () => ({ stdout: JSON.stringify(identity) }),
    });

    // Written in settings after the store was created — the case that made the
    // field come up empty.
    usePrePrompts.setState({ prompts: { ...emptyPrePrompts(), skill: { add: "use skill-creator", update: "" } } });
    await useAuthor.getState().prepare();
    expect(useAuthor.getState().form.prePrompt).toBe("use skill-creator");
    // The run's own prompt is separate, and starts empty.
    expect(useAuthor.getState().form.prompt).toBe("");

    useAuthor.getState().setField("prePrompt", "just for this run");
    await useAuthor.getState().prepare();
    expect(useAuthor.getState().form.prePrompt).toBe("just for this run");
  });
});

describe("what the agent is actually sent", () => {
  test("carries the standing context and the run's own instruction, in that order", () => {
    const prompt = jobPrompt({
      ...emptyForm(),
      sourceKind: "agent",
      type: "skill",
      prePrompt: "Use the /skill-creator skill, then verify with /skill-optimizer",
      prompt: "This is a test skill, create an example skill",
    });

    const standing = prompt.indexOf("/skill-creator");
    const run = prompt.indexOf("create an example skill");
    expect(standing).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(standing);
  });

  test("a run with no standing context sends only what was typed", () => {
    const prompt = jobPrompt({ ...emptyForm(), sourceKind: "agent", prePrompt: "", prompt: "rename the files" });
    expect(prompt).toContain("rename the files");
    expect(prompt).not.toContain("\n\n\n");
  });
});

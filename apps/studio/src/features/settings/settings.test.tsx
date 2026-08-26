import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { emit, onCommand } from "@/test/mockIpc";
import type { RunRequest } from "@/api/agent";
import { Select } from "@/core/ui/Select";
import { AgentSelect } from "./AgentSelect";
import { AGENT_LABELS } from "@seedr/registry-ops/pure";
import { AGENT_PROGRAMS, NO_TOOL_DENIAL, useAgentSettings } from "./agentSettings";
import { emptyPrePrompts, prePromptFor, usePrePrompts } from "./prePrompts";
import { useStudio } from "@/features/explorer/store";
import { SettingsPanel } from "./SettingsPanel";
import { SignInBanner } from "./SignInBanner";

/** The badge on an agent whose CLI takes no deny-rule. */
const UNDENIABLE = "git not denied";

/** A host where every agent CLI answers `--version`, except the ones named. */
function hostWithAgents(missing: string[] = []) {
  // The sign-in dialog cancels its run as it unmounts, which the real host
  // answers with a plain bool. Unregistered, the mock rejects — correctly — and
  // the rejection lands in React's unmount, outside any test's reach.
  onCommand("cancel_process", () => false);
  onCommand("run_process", (args) => {
    const request = (args as { request: { taskId: string; program: string } }).request;
    const program = request.program;
    if (missing.includes(program)) return { taskId: request.taskId, status: "not-found", exitCode: null, stdout: "", stderr: "", durationMs: 1 };
    return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: `${program} 1.2.3\n`, stderr: "", durationMs: 1 };
  });
}

beforeEach(() => {
  localStorage.clear();
  usePrePrompts.setState({ prompts: emptyPrePrompts() });
  useAgentSettings.setState({ overrides: {} });
});

describe("coding agents settings", () => {
  test("probes every agent and shows the version it answered with", async () => {
    hostWithAgents(["codex"]);
    render(<SettingsPanel />);

    expect(await screen.findAllByText(/detected · 1\.2\.3/)).toHaveLength(4);
    expect(screen.getByText(/not found/)).toBeInTheDocument();
  });

  test("names the agents whose CLI cannot be told to refuse git", async () => {
    hostWithAgents();
    render(<SettingsPanel />);

    // Every other agent is stopped by its own tool layer; these two are stopped
    // only by the prompt, and the card has to say so rather than look the same.
    const marked = await screen.findAllByText(UNDENIABLE);
    expect(marked).toHaveLength(NO_TOOL_DENIAL.length);
    for (const agent of NO_TOOL_DENIAL) {
      expect(screen.getByText(AGENT_LABELS[agent]).closest("li")).toHaveTextContent(UNDENIABLE);
    }
    expect(screen.getByText(AGENT_LABELS.claude).closest("li")).not.toHaveTextContent(UNDENIABLE);
  });

  test("a chosen binary is stored, pushed to the host, and cleared again", async () => {
    hostWithAgents();
    const overrides: Record<string, string | null> = {};
    onCommand("set_program_override", (args) => {
      const { program, path } = args as { program: string; path: string | null };
      overrides[program] = path;
      return null;
    });
    onCommand("pick_path", () => "/opt/homebrew/bin/claude");
    render(<SettingsPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "choose Claude Code binary" }));

    await waitFor(() => expect(overrides[AGENT_PROGRAMS.claude]).toBe("/opt/homebrew/bin/claude"));
    expect(await screen.findByText("/opt/homebrew/bin/claude")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("studio-agent-paths") ?? "{}")).toEqual({ claude: "/opt/homebrew/bin/claude" });

    await userEvent.click(screen.getByRole("button", { name: "clear Claude Code path" }));
    await waitFor(() => expect(overrides[AGENT_PROGRAMS.claude]).toBeNull());
    expect(JSON.parse(localStorage.getItem("studio-agent-paths") ?? "{}")).toEqual({});
  });

  test("a path the host refuses is reported, not stored", async () => {
    hostWithAgents();
    onCommand("set_program_override", () => {
      throw new Error("/nope: not a file");
    });
    onCommand("pick_path", () => "/nope");
    render(<SettingsPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "choose Claude Code binary" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("/nope: not a file");
    expect(useAgentSettings.getState().overrides.claude).toBeUndefined();
  });

  test("init drops a stored path the host no longer accepts", async () => {
    hostWithAgents();
    localStorage.setItem("studio-agent-paths", JSON.stringify({ claude: "/gone", codex: "/opt/codex" }));
    useAgentSettings.setState({ overrides: { claude: "/gone", codex: "/opt/codex" } });
    onCommand("set_program_override", (args) => {
      if ((args as { path: string }).path === "/gone") throw new Error("/gone: not a file");
      return null;
    });

    await useAgentSettings.getState().init();

    expect(useAgentSettings.getState().overrides).toEqual({ codex: "/opt/codex" });
  });
});

describe("pre-prompts settings", () => {
  test("a per-type pre-prompt is persisted and readable outside React", async () => {
    hostWithAgents();
    render(<SettingsPanel />);
    await userEvent.click(screen.getByRole("button", { name: /pre-prompts/ }));

    const field = screen.getByLabelText("add", { selector: "#preprompt-skill-add" });
    await userEvent.type(field, "use skill-creator");

    expect(prePromptFor("skill", "add")).toBe("use skill-creator");
    expect(prePromptFor("skill", "update")).toBe("");
    expect(JSON.parse(localStorage.getItem("studio-pre-prompts") ?? "{}").skill).toEqual({ add: "use skill-creator", update: "" });
  });

  test("stored pre-prompts survive a corrupt entry", () => {
    localStorage.setItem("studio-pre-prompts", "not json");
    expect(emptyPrePrompts().skill).toEqual({ add: "", update: "" });
  });
});

describe("AgentSelect", () => {
  test("lists every agent but lets only the certified ones be chosen", async () => {
    const onChange = vi.fn();
    render(<AgentSelect value="claude" onChange={onChange} certified={["claude"]} job="draft" ariaLabel="draft agent" />);

    await userEvent.click(screen.getByRole("button", { name: "draft agent" }));

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(5);
    const copilot = screen.getByRole("option", { name: "GitHub Copilot" });
    expect(copilot).toHaveAttribute("aria-disabled", "true");
    expect(copilot).toHaveAttribute("data-tip", "GitHub Copilot has no certified draft adapter yet");

    await userEvent.click(copilot);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("keyboard skips a disabled option instead of landing on it", async () => {
    const onChange = vi.fn();
    render(
      <Select
        value="a"
        ariaLabel="pick"
        onChange={onChange}
        options={[
          { value: "a", label: "A" },
          { value: "b", label: "B", disabled: true },
          { value: "c", label: "C" },
        ]}
      />
    );

    const trigger = screen.getByRole("button", { name: "pick" });
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith("c");
  });
});

describe("default checkout settings", () => {
  const OPEN = { root: "/Users/me/Work/seedr", name: "seedr", isDefault: true, hasOps: true };

  test("starts at what the host recorded and records a folder that is picked", async () => {
    hostWithAgents();
    let recorded: string | undefined;
    onCommand("default_repo", () => "/Users/me/Work/seedr");
    onCommand("pick_path", () => "/Users/me/Work/seedr-internal");
    onCommand("set_default_repo", (args) => {
      recorded = (args as { path: string }).path;
      return { ...OPEN, isDefault: false };
    });
    useStudio.setState({ repo: OPEN });

    render(<SettingsPanel />);
    await userEvent.click(screen.getByRole("button", { name: /checkout/ }));

    const field = await screen.findByLabelText("folder");
    await waitFor(() => expect(field).toHaveValue("/Users/me/Work/seedr"));
    expect(screen.getByRole("button", { name: "save the default checkout" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "choose the default checkout" }));
    await waitFor(() => expect(field).toHaveValue("/Users/me/Work/seedr-internal"));

    await userEvent.click(screen.getByRole("button", { name: "save the default checkout" }));
    await waitFor(() => expect(recorded).toBe("/Users/me/Work/seedr-internal"));
  });

  test("falls back to the open checkout when nothing is recorded, and reports a refusal", async () => {
    hostWithAgents();
    onCommand("default_repo", () => null);
    onCommand("set_default_repo", () => {
      throw new Error("Not a seedr registry: no registry/ directory");
    });
    useStudio.setState({ repo: OPEN });

    render(<SettingsPanel />);
    await userEvent.click(screen.getByRole("button", { name: /checkout/ }));

    const field = await screen.findByLabelText("folder");
    await waitFor(() => expect(field).toHaveValue(OPEN.root));

    await userEvent.clear(field);
    await userEvent.type(field, "/tmp/not-a-registry");
    await userEvent.click(screen.getByRole("button", { name: "save the default checkout" }));

    expect(await screen.findByText(/no registry\/ directory/)).toBeInTheDocument();
  });
});

describe("signing an agent in", () => {
  test("runs the CLI's own login, keeps stdin open, and passes an answer back without echoing it", async () => {
    hostWithAgents();
    let request: RunRequest | undefined;
    // The sign-in stays running until it is answered, which is the whole reason
    // stdin is held open — a mock that returns at once tests nothing.
    let finish: (() => void) | undefined;
    onCommand("run_process", (args) => {
      const sent = (args as { request: RunRequest }).request;
      if (sent.args[0] !== "auth") return { taskId: sent.taskId, status: "ok", exitCode: 0, stdout: "claude 1.2.3\n", stderr: "", durationMs: 1 };
      request = sent;
      emit("process-output", { taskId: sent.taskId, stream: "stdout", line: "Open this URL to sign in: https://claude.ai/oauth/…" });
      return new Promise((resolve) => {
        finish = () => resolve({ taskId: sent.taskId, status: "ok", exitCode: 0, stdout: "", stderr: "", durationMs: 1 });
      });
    });
    let answered: { taskId: string; text: string } | undefined;
    onCommand("send_process_input", (args) => {
      answered = args as { taskId: string; text: string };
      finish?.();
      return true;
    });

    render(<SettingsPanel />);
    await userEvent.click(await screen.findByRole("button", { name: "sign in to Claude Code" }));

    expect(await screen.findByLabelText("sign-in output")).toHaveTextContent("Open this URL to sign in");
    expect(request?.args).toEqual(["auth", "login"]);
    expect(request?.keepStdin).toBe(true);

    await userEvent.type(screen.getByLabelText("answer the sign-in"), "the-code{Enter}");

    await waitFor(() => expect(answered?.text).toBe("the-code"));
    // The code is a credential: that one was sent is worth showing, what it was is not.
    const shown = screen.getByLabelText("sign-in output");
    expect(shown).not.toHaveTextContent("the-code");
    expect(shown).toHaveTextContent("· answered");
    expect(await screen.findByText(/Signed in\./)).toBeInTheDocument();
  });
});

describe("sign-in state", () => {
  const CLAUDE_OUT = JSON.stringify({ loggedIn: false, authMethod: "none", apiProvider: "firstParty" });
  const CLAUDE_IN = JSON.stringify({ loggedIn: true, authMethod: "claudeai", email: "someone@example.com" });

  /** A host answering --version for everyone and the given auth status for claude. */
  function hostWithAuth(status: string) {
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      const ok = (stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
      if (request.args[0] === "--version") return ok(`${request.program} 1.2.3\n`);
      if (request.program === "claude" && request.args.join(" ") === "auth status") return ok(status);
      return ok("");
    });
  }

  test("reads the account out of what the CLI reports", async () => {
    hostWithAuth(CLAUDE_IN);
    render(<SettingsPanel />);
    expect(await screen.findByText("signed in · someone@example.com")).toBeInTheDocument();
  });

  test("says signed out, and the workspace says so too", async () => {
    hostWithAuth(CLAUDE_OUT);
    render(<SettingsPanel />);
    expect(await screen.findAllByText("signed out")).not.toHaveLength(0);

    // The same state, in front of someone about to fill in a form.
    render(<SignInBanner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Claude Code");
  });

  test("names an agent that is signed out even when it is not the chosen one", async () => {
    // The chosen agent is fine; two others are not. Saying nothing here is how
    // someone finds out by picking Codex in a dialog and watching it fail.
    useAgentSettings.setState({
      preferred: "claude",
      auth: { claude: { state: "in", account: null }, codex: { state: "out" }, opencode: { state: "out" }, copilot: { state: "unknown" }, antigravity: { state: "unknown" } },
    });

    render(<SignInBanner />);

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("2 coding agents are signed out");
    expect(banner).not.toHaveTextContent("Claude Code");
    // A row each, so each one can offer the sign-in that fixes it.
    expect(screen.getByRole("button", { name: "sign in to OpenAI Codex" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "sign in to OpenCode" })).toBeInTheDocument();
    // Nothing the user picked is broken yet, so this is a warning, not an alert.
    expect(banner.className).toContain("surface-warn");
    expect(banner.className).not.toContain("surface-alert");
  });

  test("leads with the chosen agent, and still names the rest", async () => {
    useAgentSettings.setState({
      preferred: "claude",
      auth: { claude: { state: "out" }, codex: { state: "out" }, opencode: { state: "in", account: null }, copilot: { state: "unknown" }, antigravity: { state: "unknown" } },
    });

    render(<SignInBanner />);

    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent("Claude Code — the chosen agent, so drafting and jobs fail");
    expect(banner).toHaveTextContent("OpenAI Codex");
    // The chosen agent is broken now, so the panel wears the destructive hue.
    expect(banner.className).toContain("surface-alert");
    expect(banner.className).not.toContain("surface-warn");
  });

  test("says nothing when no CLI reports being signed out", () => {
    useAgentSettings.setState({
      auth: { claude: { state: "in", account: null }, codex: { state: "unknown" }, opencode: { state: "unknown" }, copilot: { state: "unknown" }, antigravity: { state: "unknown" } },
    });

    render(<SignInBanner />);
    // `unknown` is not a claim, so it is not a warning either.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("reads codex's answer off the stream it actually uses", async () => {
    // codex prints its status on stderr and nothing on stdout. Reading stdout
    // alone made every answer look the same as "not logged in".
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      const done = (stdout: string, stderr: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr, durationMs: 1 });
      if (request.args[0] === "--version") return done(`${request.program} 1.2.3\n`, "");
      if (request.program === "codex") return done("", "Logged in using ChatGPT\n");
      return done("", "");
    });

    render(<SettingsPanel />);
    expect(await screen.findByText("signed in · ChatGPT")).toBeInTheDocument();
  });

  test("codex saying it is not logged in is conclusive, and it is on stderr too", async () => {
    // Verified against the CLI: asked to run while it says this, codex answers
    // 401 Unauthorized. So this negative is a real "out", not an unknown.
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      const done = (stdout: string, stderr: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr, durationMs: 1 });
      if (request.args[0] === "--version") return done(`${request.program} 1.2.3\n`, "");
      if (request.program === "codex") return done("", "Not logged in\n");
      return done("", "");
    });

    render(<SettingsPanel />);
    expect(await screen.findAllByText("signed out")).toHaveLength(1);
  });

  test("no stored credential is not a claim that the CLI cannot run", async () => {
    // opencode finishes jobs while its own `auth list` reports none stored, so
    // zero is unknown, not signed out. A stored one is still proof.
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      const ok = (stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });
      if (request.args[0] === "--version") return ok(`${request.program} 1.2.3\n`);
      if (request.program === "opencode") return ok("Credentials\n0 credentials\n");
      return ok("");
    });

    render(<SettingsPanel />);
    await waitFor(() => expect(screen.getAllByText("sign-in unknown").length).toBeGreaterThan(0));
    expect(screen.queryByText("signed out")).toBeNull();
  });

  test("a CLI with nothing to ask is not guessed at", async () => {
    hostWithAuth(CLAUDE_OUT);
    render(<SettingsPanel />);
    // Antigravity has no status command; claiming either state would be a lie.
    await waitFor(() => expect(screen.getAllByText("sign-in unknown").length).toBeGreaterThan(0));
  });
});

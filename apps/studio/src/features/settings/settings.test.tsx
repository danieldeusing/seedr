import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { onCommand } from "@/test/mockIpc";
import { Select } from "@/core/ui/Select";
import { AgentSelect } from "./AgentSelect";
import { AGENT_PROGRAMS, useAgentSettings } from "./agentSettings";
import { emptyPrePrompts, prePromptFor, usePrePrompts } from "./prePrompts";
import { useStudio } from "@/features/explorer/store";
import { SettingsPanel } from "./SettingsPanel";

/** A host where every agent CLI answers `--version`, except the ones named. */
function hostWithAgents(missing: string[] = []) {
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

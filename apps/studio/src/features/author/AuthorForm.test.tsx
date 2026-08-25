import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RunRequest } from "@/api/agent";
import { onCommand } from "@/test/mockIpc";
import { AuthorForm } from "./AuthorForm";
import { emptyPrePrompts, usePrePrompts } from "@/features/settings/prePrompts";
import { emptyForm, useAuthor } from "./store";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);

const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

beforeEach(() => {
  useAuthor.getState().reset();
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    if (request.program === "claude" && request.args[0] === "--version") return ok(request, "2.1.226");
    if (request.program === "claude" && request.args[0] === "--help") return ok(request, "--output-format --json-schema --tools");
    if (request.program === "claude") return ok(request, JSON.stringify({ type: "result", is_error: false, result: "", structured_output: { description: "Fills PDF forms.", longDescription: LONG } }));
    if (request.args.includes("identity")) return ok(request, JSON.stringify({ owner: "acme", authorName: "Acme" }));
    return ok(request, JSON.stringify({ ok: true, kind: "add-local", type: "skill", slug: "pdf", item: {}, changedPaths: ["registry/skills/pdf/item.json", "registry/skills/manifest.json"], headBefore: "abc1234def" }));
  });
  onCommand("pick_path", () => "/src/pdf");
  onCommand("read_source_files", () => ({ files: { "SKILL.md": "# PDF" }, skipped: [] }));
});

describe("AuthorForm", () => {
  test("walks the add-local flow: probe, choose source, fill, apply, report", async () => {
    const onAdded = vi.fn();
    render(<AuthorForm onAdded={onAdded} />);

    expect(await screen.findByText("2.1.226")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "drafting agent" })).toHaveTextContent("Claude Code");
    expect(screen.getByLabelText("author")).toHaveValue("Acme");

    await userEvent.click(screen.getByRole("button", { name: "choose folder" }));
    expect(screen.getByLabelText("slug")).toHaveValue("pdf");

    // The descriptions are the agent's to write — the form does not ask for them.
    expect(screen.queryByLabelText("description")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("tl;dr")).not.toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "add to registry" });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(await screen.findByText(/Added skill\/pdf at abc1234/)).toBeInTheDocument();
    expect(screen.getByText("registry/skills/manifest.json")).toBeInTheDocument();
    expect(onAdded).toHaveBeenCalledWith("skill", "pdf");
  });

  test("keeps the submit disabled and names the problems until the form is valid", async () => {
    render(<AuthorForm onAdded={() => {}} />);
    await screen.findByText("2.1.226");
    expect(screen.getByRole("button", { name: "add to registry" })).toBeDisabled();
    expect(screen.getByText(/choose the file or folder to add/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("slug"), "Bad Slug");
    expect(screen.getByText(/must match/)).toBeInTheDocument();
  });

  test("shows the agent diagnostic when Claude is unavailable", async () => {
    useAuthor.setState({ probe: { available: false, version: null, diagnostic: "Claude Code is not installed or not on PATH: npm install -g @anthropic-ai/claude-code" } });
    onCommand("run_process", (args) => ({ taskId: (args?.request as RunRequest).taskId, status: "not-found", exitCode: null, stdout: "", stderr: "", durationMs: 1 }));
    render(<AuthorForm onAdded={() => {}} />);
    expect(await screen.findByText(/not installed or not on PATH/)).toBeInTheDocument();
    // Nothing to press: drafting is not a button any more, it is what submitting does.
    expect(screen.queryByRole("button", { name: /draft descriptions/ })).not.toBeInTheDocument();
  });

  test("a rejected draft is shown verbatim", async () => {
    useAuthor.setState({ probe: { available: true, version: "2.1.226", diagnostic: null }, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" }, draftErrors: ["the draft was rejected twice", "description is missing"] });
    render(<AuthorForm onAdded={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Draft rejected: the draft was rejected twice; description is missing");
  });
});

describe("AuthorForm — where the capability comes from", () => {
  /** Open a Select by its label and choose one of its options. */
  async function choose(selectLabel: string, option: string) {
    await userEvent.click(screen.getByRole("button", { name: selectLabel }));
    await userEvent.click(screen.getByRole("option", { name: option }));
  }

  test("a git repository asks for the URL instead of a folder, and refuses a non-github one", async () => {
    render(<AuthorForm onAdded={() => {}} />);
    await choose("source kind", "a git repository");

    expect(screen.queryByRole("button", { name: "choose folder" })).not.toBeInTheDocument();
    expect(screen.getByText(/paste the repository's URL/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("repository"), "https://gitlab.com/o/r");
    expect(screen.getByText(/only github.com repositories/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("repository"));
    await userEvent.type(screen.getByLabelText("repository"), "https://github.com/obra/superpowers");
    expect(screen.getByRole("button", { name: "hand it to the agent" })).toBeEnabled();
  });

  test("the prompt is the type's pre-prompt until it is edited by hand", async () => {
    usePrePrompts.setState({ prompts: { ...emptyPrePrompts(), skill: { add: "use skill-creator", update: "" }, hook: { add: "hooks are scripts", update: "" } } });
    useAuthor.getState().reset();
    render(<AuthorForm onAdded={() => {}} />);

    const prompt = screen.getByLabelText("prompt");
    expect(prompt).toHaveValue("use skill-creator");

    await choose("type", "hook");
    expect(prompt).toHaveValue("hooks are scripts");

    await userEvent.type(prompt, " and mine");
    await choose("type", "skill");
    expect(prompt).toHaveValue("hooks are scripts and mine");
  });

  test("the descriptions are the agent's, and their absence never blocks the submit", async () => {
    render(<AuthorForm onAdded={() => {}} />);
    await screen.findByText("2.1.226");
    await userEvent.click(screen.getByRole("button", { name: "choose folder" }));

    expect(screen.getByText(/The agent writes the description and the TL;DR/)).toBeInTheDocument();
    expect(screen.queryByText(/is missing 'description'/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "add to registry" })).toBeEnabled());
  });

  test("a repository derives the author, and switching back restores the configured one", async () => {
    render(<AuthorForm onAdded={() => {}} />);
    await screen.findByText("2.1.226");
    expect(screen.getByLabelText("author")).toHaveValue("Acme");

    await choose("source kind", "a git repository");
    expect(screen.getByLabelText("author")).toHaveValue("");
    expect(screen.getByLabelText("author")).toHaveAttribute("placeholder", "derived from the source");
    expect(screen.getByLabelText("author url")).toHaveAttribute("placeholder", "derived from the source");

    await choose("source kind", "a local folder");
    expect(screen.getByLabelText("author")).toHaveValue("Acme");
  });

  test("every label explains itself on hover", () => {
    render(<AuthorForm onAdded={() => {}} />);
    for (const label of ["from", "slug", "type", "name", "agents", "scope", "author", "prompt"]) {
      expect(screen.getByText(label, { selector: ".lbl" })).toHaveAttribute("data-tip");
    }
  });
});

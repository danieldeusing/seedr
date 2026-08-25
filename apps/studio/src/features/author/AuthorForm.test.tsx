import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { RunRequest } from "@/api/agent";
import { onCommand } from "@/test/mockIpc";
import { AuthorForm } from "./AuthorForm";
import { emptyForm, useAuthor } from "./store";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);

const ok = (request: RunRequest, stdout: string) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout, stderr: "", durationMs: 1 });

beforeEach(() => {
  useAuthor.getState().reset();
  onCommand("run_process", (args) => {
    const request = args?.request as RunRequest;
    if (request.program === "claude" && request.args[0] === "--version") return ok(request, "2.1.226");
    if (request.program === "claude") return ok(request, "--output-format --json-schema --tools");
    if (request.args.includes("identity")) return ok(request, JSON.stringify({ owner: "acme", authorName: "Acme" }));
    return ok(request, JSON.stringify({ ok: true, kind: "add-local", type: "skill", slug: "pdf", item: {}, changedPaths: ["registry/skills/pdf/item.json", "registry/skills/manifest.json"], headBefore: "abc1234def" }));
  });
  onCommand("pick_path", () => "/src/pdf");
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

    await userEvent.type(screen.getByLabelText("description"), "Fills PDF forms.");
    await userEvent.type(screen.getByLabelText("tl;dr"), LONG);
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

  test("shows the agent diagnostic and disables drafting when Claude is unavailable", async () => {
    useAuthor.setState({ probe: { available: false, version: null, diagnostic: "Claude Code is not installed or not on PATH: npm install -g @anthropic-ai/claude-code" } });
    onCommand("run_process", (args) => ({ taskId: (args?.request as RunRequest).taskId, status: "not-found", exitCode: null, stdout: "", stderr: "", durationMs: 1 }));
    render(<AuthorForm onAdded={() => {}} />);
    expect(await screen.findByText(/not installed or not on PATH/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "draft descriptions with Claude" })).toBeDisabled();
  });

  test("a rejected draft is shown verbatim", async () => {
    useAuthor.setState({ probe: { available: true, version: "2.1.226", diagnostic: null }, form: { ...emptyForm(), sourcePath: "/src/pdf", slug: "pdf", name: "PDF" }, draftErrors: ["the draft was rejected twice", "description is missing"] });
    render(<AuthorForm onAdded={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Draft rejected: the draft was rejected twice; description is missing");
  });
});

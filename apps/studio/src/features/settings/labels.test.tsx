import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import type { RunRequest } from "@/api/agent";
import { onCommand } from "@/test/mockIpc";
import { labelProblems, LabelsPage, slugify } from "./LabelsPage";
import { LabelRow } from "./LabelRow";
import { useLabels } from "./labels";

const CATALOGUE = { version: 1, labels: [{ slug: "project-x", name: "Project X", color: "violet" }] };

/** A host whose checkout has the given catalogue, and which accepts the op. */
function host(catalogue: unknown = CATALOGUE, ops: RunRequest[] = []) {
  onCommand("path_exists", () => catalogue !== null);
  onCommand("read_text", () => {
    if (catalogue === null) throw new Error("registry/labels.json: not a file");
    return JSON.stringify(catalogue);
  });
  onCommand("run_process", (args) => {
    const request = (args as { request: RunRequest }).request;
    ops.push(request);
    return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ ok: true, kind: "set-labels", item: null, changedPaths: ["registry/labels.json"], headBefore: "abc1234" }), stderr: "", durationMs: 1 };
  });
  return ops;
}

beforeEach(() => {
  useLabels.setState({ labels: [], loading: false, error: null });
});

describe("slugify and labelProblems", () => {
  test("a typed name becomes the slug it will be stored under", () => {
    expect(slugify("Project X")).toBe("project-x");
    expect(slugify("  Client — Acme!  ")).toBe("client-acme");
    expect(slugify("!!!")).toBe("");
  });

  test("names the things the catalogue would refuse, before asking for a transaction", () => {
    expect(labelProblems([{ slug: "a", name: "A", color: "violet" }])).toEqual([]);
    expect(labelProblems([{ slug: "", name: " ", color: "violet" }])).toEqual(["a label needs a name"]);
    expect(labelProblems([{ slug: "", name: "!!!", color: "violet" }])).toEqual(["!!!: that name has no slug in it"]);
    expect(
      labelProblems([
        { slug: "a", name: "A", color: "violet" },
        { slug: "a", name: "Also A", color: "green" },
      ])
    ).toEqual(["a: two labels cannot share a slug"]);
  });
});

describe("LabelsPage", () => {
  test("reads the checkout's catalogue and saves an edit as one transaction", async () => {
    const ops = host();
    render(<LabelsPage />);

    const name = await screen.findByLabelText("label 1 name");
    expect(name).toHaveValue("Project X");
    expect(screen.getByRole("button", { name: "save labels" })).toBeDisabled();

    await userEvent.clear(name);
    await userEvent.type(name, "Client Acme");
    expect(screen.getByText("unsaved changes")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "save labels" }));

    await waitFor(() => expect(ops).toHaveLength(1));
    const op = JSON.parse(ops[0]?.stdin ?? "{}");
    expect(op).toMatchObject({ v: 1, kind: "set-labels", labels: [{ slug: "client-acme", name: "Client Acme", color: "violet" }] });
  });

  test("a refused removal is shown as the transaction worded it", async () => {
    host();
    onCommand("run_process", (args) => ({
      taskId: (args as { request: RunRequest }).request.taskId,
      status: "failed",
      exitCode: 1,
      stdout: "",
      stderr: 'registry-op: Refusing to drop 1 label(s) items still carry: "project-x" (skill/alpha) — relabel those items first',
      durationMs: 1,
    }));
    render(<LabelsPage />);

    await userEvent.click(await screen.findByRole("button", { name: "remove Project X" }));
    await userEvent.click(screen.getByRole("button", { name: "save labels" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/items still carry: "project-x" \(skill\/alpha\)/);
  });

  test("a checkout with no catalogue file says so instead of failing", async () => {
    host(null);
    render(<LabelsPage />);
    expect(await screen.findByText(/No labels yet/)).toBeInTheDocument();
  });
});

describe("LabelRow", () => {
  test("offers the catalogue plus none", async () => {
    host();
    render(<LabelRow id="l" value="" onChange={() => {}} disabled={false} />);

    const select = await screen.findByRole("button", { name: "label" });
    await userEvent.click(select);

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["no label", "Project X"]);
  });

  test("an empty catalogue says where labels come from rather than showing an empty dropdown", async () => {
    host({ version: 1, labels: [] });
    render(<LabelRow id="l" value="" onChange={() => {}} disabled={false} />);

    expect(await screen.findByText(/no labels in this checkout/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "label" })).not.toBeInTheDocument();
  });
});

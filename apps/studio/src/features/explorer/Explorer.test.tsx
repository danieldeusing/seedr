import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useRowStyle } from "@/core/rowStyle";
import { fs } from "@/api/fs";
import type { RunRequest } from "@/api/agent";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Explorer } from "./Explorer";
import { useStudio } from "./store";
import { loadRegistry } from "./registry";

const SEARCH = "search capabilities";
const controls = { onAddCapability: () => {}, onGitStatus: () => {}, onSettings: () => {} };

beforeEach(() => {
  useRowStyle.setState({ style: "icons" });
});

describe("Explorer", () => {
  test("renders a real empty state for a fresh fork", () => {
    render(<Explorer items={[]} problems={[]} selected={null} onSelect={() => {}} {...controls} />);
    expect(screen.getByTestId("empty-registry")).toHaveTextContent("no items yet");
  });

  test("groups populated types with counts, ownership mode and the agent matrix", async () => {
    mockFs(registryFiles());
    const { items, problems } = await loadRegistry(fs, "registry");
    const onSelect = vi.fn();
    render(<Explorer items={items} problems={problems} selected={{ type: "skill", slug: "pdf" }} onSelect={onSelect} {...controls} />);

    expect(screen.getByRole("button", { name: /skills\/ 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mcp\/ 1/ })).toBeInTheDocument();
    // An empty type is listed too, at zero, and does not open: the absence is a
    // fact about this registry, not a missing group.
    const empty = screen.getByRole("button", { name: /settings\/ 0/ });
    expect(empty).toHaveAttribute("aria-disabled", "true");
    expect(empty).toHaveAttribute("data-tip", "No settings in this registry yet");
    expect(screen.getByRole("alert")).toHaveTextContent("1 unreadable item file(s)");
    expect(screen.getByLabelText("1 validation problems")).toBeInTheDocument();

    // icons view (the default): only the editable pencil is marked — read-only is
    // the unmarked default — plus the brand marks of the supported agents
    const pdf = screen.getByRole("button", { name: /PDF$/ });
    expect(pdf).toHaveAttribute("aria-current", "true");
    expect(within(pdf).queryByLabelText("editable")).toBeNull();
    expect(within(pdf).getByAltText("Claude Code")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /Playwright$/ })).getByLabelText("editable")).toBeInTheDocument();

    // the footer switch flips every row to the `rw-`/`cgaxo` text form
    await userEvent.click(screen.getByLabelText(/row style: icons/));
    await userEvent.click(screen.getByRole("menuitem", { name: /text \(rw-/ }));
    expect(screen.getByRole("button", { name: /PDF$/ })).toHaveTextContent("r--");
    expect(screen.getByRole("button", { name: /PDF$/ })).toHaveTextContent("c----");
    expect(screen.getByRole("button", { name: /Playwright$/ })).toHaveTextContent("rw-");

    await userEvent.click(screen.getByRole("button", { name: /Playwright$/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "mcp", slug: "playwright" });
  });

  test("search narrows every group at once and says when nothing matches", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => {}} {...controls} />);

    await userEvent.type(screen.getByLabelText(SEARCH), "play");
    expect(screen.getByRole("button", { name: /Playwright$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF$/ })).toBeNull();
    expect(screen.queryByText(/skills\//)).toBeNull();

    await userEvent.clear(screen.getByLabelText(SEARCH));
    await userEvent.type(screen.getByLabelText(SEARCH), "zzz");
    expect(screen.getByText(/No capability matches “zzz”/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("clear search"));
    expect(screen.getByRole("button", { name: /PDF$/ })).toBeInTheDocument();
  });

  test("groups collapse one by one and all at once", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => {}} {...controls} />);

    await userEvent.click(screen.getByRole("button", { name: /skills\/ 2/ }));
    expect(screen.queryByRole("button", { name: /PDF$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Playwright$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "collapse all groups" }));
    expect(screen.queryByRole("button", { name: /Playwright$/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "expand all groups" }));
    expect(screen.getByRole("button", { name: /PDF$/ })).toBeInTheDocument();
  });
});

describe("items that have parted from their source folder", () => {
  test("are marked in the list, and the ones in sync are not", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({
      items,
      sourceStates: {
        "skill/pdf": { state: "behind" },
        "mcp/playwright": { state: "current" },
        "skill/broken": { state: "missing" },
      },
    });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    const behind = screen.getByLabelText(/source folder has changed/i);
    expect(behind).toBeInTheDocument();
    expect(screen.getByLabelText(/source folder it was copied from is gone/i)).toBeInTheDocument();
    // `current` says nothing: an unmarked row means there is nothing to answer for.
    expect(screen.queryByLabelText(/unchanged/i)).toBeNull();

    // The icon sits at the far edge, so on a wide explorer the name carries the
    // same colour — otherwise the only sign of it is an inch away from it.
    expect(behind.getAttribute("class")).toMatch(/ml-auto/);
    // The chip carries it, not the hue: on green and mono the amber sits at
    // 1.03:1 against the row's own text, so a mark that was only a colour was
    // invisible there. The border and fill come from `currentColor`.
    expect(behind.getAttribute("class")).toMatch(/source-mark/);
    const row = behind.closest("button")!;
    const name = within(row).getByText("PDF");
    expect(name.className).toMatch(/text-amber-400/);
    // Weight too, because weight is the one signal no theme can wash out.
    expect(name.className).toMatch(/font-medium/);
  });
});

  test("says why the marks are missing rather than showing an empty column", async () => {
    // A checkout whose CLI predates the batch command answers "unknown type",
    // and swallowing that looked exactly like nothing being out of sync.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, sourceStates: {}, sourceCheckError: 'registry-op: unknown type ""' });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    expect(screen.getByText("Source marks unavailable")).toBeInTheDocument();
    expect(screen.getByText(/unknown type/)).toBeInTheDocument();
  });

describe("the git button's count", () => {
  test("shows how many paths are uncommitted, and says what that costs", async () => {
    // Every registry operation refuses while the worktree is dirty. Finding that
    // out by pressing a button and reading the failure is late.
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, uncommitted: 3 });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    expect(screen.getByLabelText("3 uncommitted paths")).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: "git" }).getAttribute("data-tip")).toMatch(/refuses until they are committed/);
  });

  test("says nothing when the worktree is clean", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, uncommitted: 0 });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    expect(screen.queryByLabelText(/uncommitted paths/)).toBeNull();
  });

  test("marks the other corner when the remote has commits this checkout has not pulled", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, uncommitted: 0, remote: { upstream: "origin/main", behind: 4, ahead: 0, fetched: true, fetchError: null } });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    expect(screen.getByLabelText("4 commits to pull")).toHaveTextContent("4");
    expect(screen.getByRole("button", { name: "git" }).getAttribute("data-tip")).toMatch(/not pulled yet — this list is out of date/);
  });

  test("both marks sit on the same button without displacing each other", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, uncommitted: 3, remote: { upstream: "origin/main", behind: 4, ahead: 0, fetched: true, fetchError: null } });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    // "Have I saved" and "am I current" are different questions and get
    // different corners, rather than one mark meaning whichever came last.
    expect(screen.getByLabelText("3 uncommitted paths")).toBeInTheDocument();
    expect(screen.getByLabelText("4 commits to pull")).toBeInTheDocument();
  });

  test("a fetch that never got through does NOT mark the button clean", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ items, uncommitted: 0, remote: { upstream: "origin/main", behind: 0, ahead: 0, fetched: false, fetchError: "offline" } });

    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    // behind is 0 here because nothing was asked, not because it is current.
    // The badge stays off and the title bar carries the reason in words —
    // a red 0 would be wrong and a silent green tick would be a lie.
    expect(screen.queryByLabelText(/commits to pull/)).toBeNull();
  });
});

describe("the up-to-date check", () => {
  const CHECK = "check capabilities against their sources";
  const repo = { root: "/repo", name: "repo", isDefault: true, hasOps: true, registryDir: "registry" };

  /** A host answering `upstream-status` with these items, collecting every request it gets. */
  function host(items: unknown[]) {
    const requests: RunRequest[] = [];
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      requests.push(request);
      return { taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ checkedAt: "2026-09-02T12:02:00Z", items }), stderr: "", durationMs: 1 };
    });
    return requests;
  }

  beforeEach(() => {
    useStudio.setState({ repo, toolingRepo: null, sourceStates: {}, sourceCheckError: null, upstreamStates: {}, upstreamCheckError: null, upstreamCheckedAt: 0, upstreamChecking: false });
  });

  test("asks the host, marks the rows that are behind and counts them on the button", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    const requests = host([
      { type: "skill", slug: "pdf", state: "behind", upstream: { repo: "anthropics/skills", sha: "b".repeat(40), path: "skills/pdf" }, upstreamUpdatedAt: "2026-09-01T08:00:00Z" },
      { type: "skill", slug: "broken", state: "current" },
    ]);
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    // Before any check the rows say nothing: this is asked for, never assumed.
    expect(screen.queryByLabelText(/behind its source/i)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: CHECK }));

    const mark = await screen.findByLabelText(/behind its source/i);
    expect(requests.some((request) => request.args.includes("upstream-status"))).toBe(true);
    expect(mark).toHaveAttribute("role", "img");
    expect(mark.getAttribute("class")).toMatch(/ml-auto/);
    expect(mark.getAttribute("aria-label")).toMatch(/upstream changed on/);
    // Both rows are named PDF; the one without a validation problem is `pdf`.
    expect(within(mark.closest("button")!).queryByLabelText(/validation problems/)).toBeNull();
    // `current` says nothing, as with the source marks: one mark for two items.
    expect(screen.getAllByLabelText(/behind its source/i)).toHaveLength(1);
    expect(screen.getByLabelText("1 capabilities behind their source")).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: CHECK }).getAttribute("data-tip")).toMatch(/1 of 2 behind · checked \d/);
  });

  test("an item that could not be compared carries the reason, in a neutral tone", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    host([{ type: "skill", slug: "pdf", state: "unknown", reason: "no longer listed in claude-plugins-official" }]);
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    await userEvent.click(screen.getByRole("button", { name: CHECK }));

    const mark = await screen.findByLabelText("no longer listed in claude-plugins-official");
    expect(mark.getAttribute("class")).toMatch(/text-neutral-500/);
    expect(screen.queryByLabelText(/behind their source/)).toBeNull();
    // Not "all current": one of them was never compared, and the tip says so.
    expect(screen.getByRole("button", { name: CHECK }).getAttribute("data-tip")).toMatch(/none of 1 behind, 1 not compared/);
  });

  test("says that a check failed rather than showing every row as current", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: GitHub answered 403: rate limit exceeded", durationMs: 1 };
    });
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    await userEvent.click(screen.getByRole("button", { name: CHECK }));

    expect(await screen.findByText("Up-to-date check failed")).toBeInTheDocument();
    expect(screen.getByText(/rate limit exceeded/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/behind its source/i)).toBeNull();
    expect(screen.queryByLabelText(/behind their source/)).toBeNull();
    // The button explains itself again, without a count it never got.
    expect(screen.getByRole("button", { name: CHECK }).getAttribute("data-tip")).not.toMatch(/checked/);
  });

  test("is not offered without the operations CLI, and says why", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs, "registry");
    useStudio.setState({ repo: { ...repo, hasOps: false }, toolingRepo: null });
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => undefined} {...controls} />);

    const button = screen.getByRole("button", { name: CHECK });
    expect(button).toBeDisabled();
    expect(button.getAttribute("data-tip")).toMatch(/no scripts\/registry-op\.ts/);
  });
});

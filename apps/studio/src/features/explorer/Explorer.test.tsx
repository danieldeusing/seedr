import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useRowStyle } from "@/core/rowStyle";
import { fs } from "@/api/fs";
import { mockFs } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Explorer } from "./Explorer";
import { useStudio } from "./store";
import { loadRegistry } from "./registry";

const SEARCH = "search capabilities";
const controls = { onAddCapability: () => {}, onGitStatus: () => {}, onSettings: () => {}, onSwitchRepo: () => {} };

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

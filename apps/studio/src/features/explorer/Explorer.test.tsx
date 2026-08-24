import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useRowStyle } from "@/core/rowStyle";
import { fs } from "@/api/fs";
import { mockFs } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Explorer } from "./Explorer";
import { loadRegistry } from "./registry";

const SEARCH = "search capabilities";

beforeEach(() => {
  useRowStyle.setState({ style: "icons" });
});

describe("Explorer", () => {
  test("renders a real empty state for a fresh fork", () => {
    render(<Explorer items={[]} problems={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByTestId("empty-registry")).toHaveTextContent("no items yet");
  });

  test("groups populated types with counts, ownership mode and the agent matrix", async () => {
    mockFs(registryFiles());
    const { items, problems } = await loadRegistry(fs);
    const onSelect = vi.fn();
    render(<Explorer items={items} problems={problems} selected={{ type: "skill", slug: "pdf" }} onSelect={onSelect} />);

    expect(screen.getByRole("button", { name: /skills\/ 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mcp\/ 1/ })).toBeInTheDocument();
    // empty type groups are not rendered at all
    expect(screen.queryByText(/settings\//)).toBeNull();
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
    const { items } = await loadRegistry(fs);
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => {}} />);

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
    const { items } = await loadRegistry(fs);
    render(<Explorer items={items} problems={[]} selected={null} onSelect={() => {}} />);

    await userEvent.click(screen.getByRole("button", { name: /skills\/ 2/ }));
    expect(screen.queryByRole("button", { name: /PDF$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Playwright$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "collapse all groups" }));
    expect(screen.queryByRole("button", { name: /Playwright$/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "expand all groups" }));
    expect(screen.getByRole("button", { name: /PDF$/ })).toBeInTheDocument();
  });
});

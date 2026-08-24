import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { fs } from "@/api/fs";
import { mockFs } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Explorer } from "./Explorer";
import { loadRegistry } from "./registry";

describe("Explorer", () => {
  test("renders a real empty state for a fresh fork", () => {
    render(<Explorer items={[]} problems={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByTestId("empty-registry")).toHaveTextContent("no items yet");
  });

  test("groups items by type directory with counts, flags invalid ones, lists unreadable files", async () => {
    mockFs(registryFiles());
    const { items, problems } = await loadRegistry(fs);
    const onSelect = vi.fn();
    render(<Explorer items={items} problems={problems} selected={{ type: "skill", slug: "pdf" }} onSelect={onSelect} />);

    expect(screen.getByRole("heading", { name: /skills\/ 2/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /mcp\/ 1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /settings\/ 0/ })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1 unreadable item file(s)");
    expect(screen.getByLabelText("1 validation problems")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^PDF$/ })).toHaveAttribute("aria-current", "true");

    await userEvent.click(screen.getByRole("button", { name: /Playwright/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "mcp", slug: "playwright" });
  });
});

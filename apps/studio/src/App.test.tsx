import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { App } from "./App";
import { useStudio } from "./features/explorer/store";

beforeEach(() => {
  useStudio.setState({ repo: null, items: [], problems: [], loading: false, error: null, selected: null });
  onCommand("watch_registry", () => undefined);
});

describe("App", () => {
  test("starts on onboarding without a repo and opens the explorer after choosing one", async () => {
    onCommand("get_repo", () => null);
    onCommand("pick_repo", () => ({ root: "/repo", name: "repo", isDefault: true }));
    mockFs(registryFiles());

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Choose a registry" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "choose folder" }));
    expect(await screen.findByRole("button", { name: /skills\/ 2/ })).toBeInTheDocument();
    expect(screen.getByText("Select an item, or add a capability.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /PDF$/ }));
    expect(await screen.findByRole("heading", { name: "PDF" })).toBeInTheDocument();
  });

  test("switches to the add-capability pane and back to an item", async () => {
    onCommand("get_repo", () => ({ root: "/repo", name: "repo", isDefault: true }));
    onCommand("run_process", (args) => ({ taskId: (args?.request as { taskId: string }).taskId, status: "not-found", exitCode: null, stdout: "", stderr: "", durationMs: 1 }));
    mockFs(registryFiles());
    useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true } });

    render(<App />);
    // wait for the loaded explorer first: the empty state carries an add button too,
    // and clicking it just as the list replaces it loses the click
    await screen.findByRole("button", { name: /skills\/ 2/ });
    await userEvent.click(screen.getByRole("button", { name: "add capability" }));
    const dialog = await screen.findByRole("dialog", { name: /add-local/ });
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText(/not installed or not on PATH/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /close registry-op run/ }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /PDF$/ }));
    expect(await screen.findByRole("heading", { name: "PDF" })).toBeInTheDocument();
  });

  test("shows the host's refusal on onboarding", async () => {
    onCommand("get_repo", () => null);
    onCommand("pick_repo", () => {
      throw new Error("Not a seedr registry");
    });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "choose folder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not a seedr registry");
  });
});

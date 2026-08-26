import { fireEvent, render, screen } from "@testing-library/react";
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
    onCommand("pick_repo", () => ({ root: "/repo", name: "repo", isDefault: true, hasOps: true }));
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
    onCommand("get_repo", () => ({ root: "/repo", name: "repo", isDefault: true, hasOps: true }));
    onCommand("run_process", (args) => ({ taskId: (args?.request as { taskId: string }).taskId, status: "not-found", exitCode: null, stdout: "", stderr: "", durationMs: 1 }));
    mockFs(registryFiles());
    useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true, hasOps: true } });

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

  test("gives the workspace the height its siblings leave, however many there are", async () => {
    onCommand("get_repo", () => ({ root: "/repo", name: "repo", isDefault: true, hasOps: true }));
    mockFs(registryFiles());
    useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true, hasOps: true } });

    render(<App />);
    // The sign-in banner renders only when an agent is signed out. Under a
    // three-row grid template its absence moved the workspace into an `auto`
    // row and left the `1fr` row below it empty — 433px of dead space, measured
    // on a fork with four items. A column cannot count its children wrong.
    expect(await screen.findByTestId("app-shell")).toHaveClass("flex", "h-screen", "flex-col");
    expect(await screen.findByTestId("workspace")).toHaveClass("flex-1", "min-h-0");
  });

  test("widens the sidebar when its right edge is dragged", async () => {
    onCommand("get_repo", () => ({ root: "/repo", name: "repo", isDefault: true, hasOps: true }));
    mockFs(registryFiles());
    useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true, hasOps: true } });

    render(<App />);
    const workspace = await screen.findByTestId("workspace");
    expect(workspace).toHaveStyle({ gridTemplateColumns: "288px auto minmax(0,1fr)" });

    fireEvent.mouseDown(screen.getByLabelText("resize sidebar"), { clientX: 288 });
    fireEvent.mouseMove(document, { clientX: 388 });
    fireEvent.mouseUp(document);

    expect(workspace).toHaveStyle({ gridTemplateColumns: "388px auto minmax(0,1fr)" });
  });

  test("holds the sidebar between its minimum and maximum width", async () => {
    onCommand("get_repo", () => ({ root: "/repo", name: "repo", isDefault: true, hasOps: true }));
    mockFs(registryFiles());
    useStudio.setState({ repo: { root: "/repo", name: "repo", isDefault: true, hasOps: true } });

    render(<App />);
    const workspace = await screen.findByTestId("workspace");

    fireEvent.mouseDown(screen.getByLabelText("resize sidebar"), { clientX: 288 });
    fireEvent.mouseMove(document, { clientX: 4000 });
    expect(workspace).toHaveStyle({ gridTemplateColumns: "600px auto minmax(0,1fr)" });

    fireEvent.mouseMove(document, { clientX: 0 });
    expect(workspace).toHaveStyle({ gridTemplateColumns: "200px auto minmax(0,1fr)" });
    fireEvent.mouseUp(document);
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

import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { fs } from "@/api/fs";
import { invoke, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Detail } from "./Detail";
import { loadRegistry } from "./registry";
import { useStudio } from "./store";

describe("Detail", () => {
  test("shows metadata, the file tree, the first file's preview, and opens it with the default app", async () => {
    mockFs(registryFiles());
    onCommand("open_path", () => undefined);
    const { items } = await loadRegistry(fs);
    const playwright = items.find((i) => i.slug === "playwright")!;

    render(<Detail item={playwright} />);

    expect(screen.getByRole("heading", { name: "Playwright" })).toBeInTheDocument();
    expect(screen.getByText("seedr")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "docs" })).toBeInTheDocument();

    // the first file is selected on its own and previewed (Monaco under jsdom is a <pre>)
    expect(await screen.findByTestId("monaco-preview")).toHaveTextContent("notes");

    // the plain-text toggle drops to the raw <pre>
    await userEvent.click(screen.getByRole("button", { name: "plain text" }));
    expect(screen.getByTestId("file-content")).toHaveTextContent("notes");

    await userEvent.click(screen.getByRole("button", { name: "mcp.md" }));
    expect(await screen.findByTestId("file-content")).toHaveTextContent("config");

    // open-with lives in the file's right-click menu now, configr-style
    fireEvent.contextMenu(screen.getByRole("button", { name: "mcp.md" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /open with default app/ }));
    expect(invoke).toHaveBeenCalledWith("open_path", { rel: "registry/mcp/playwright/mcp.md" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("states validation problems and the absence of content files", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs);
    render(<Detail item={items.find((i) => i.slug === "broken")!} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/compatibility: must list at least one coding agent/);
    expect(await screen.findByText(/metadata only/)).toBeInTheDocument();
  });

  test("a file the host refuses to read shows the refusal", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs);
    onCommand("read_text", () => {
      throw new Error("registry/mcp/playwright/mcp.md: too large");
    });
    render(<Detail item={items.find((i) => i.slug === "playwright")!} />);
    await userEvent.click(await screen.findByRole("button", { name: "mcp.md" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("too large");
  });

  test("re-reads the previewed file when the registry changes under it", async () => {
    const files = registryFiles();
    mockFs(files);
    let onDisk = "before";
    // Only the previewed file moves; item.json still has to load, or there is
    // no item to render.
    onCommand("read_text", (args) => {
      const rel = String(args?.rel);
      return rel.endsWith(".json") ? (files[rel] ?? "") : onDisk;
    });
    const { items } = await loadRegistry(fs);

    render(<Detail item={items.find((i) => i.slug === "playwright")!} />);
    expect(await screen.findByTestId("monaco-preview")).toHaveTextContent("before");

    // The path did not change; the contents did. Without the revision the
    // preview kept showing what it read first, and a registry reset made from
    // outside looked like the app ignoring it.
    onDisk = "after";
    act(() => {
      useStudio.setState({ revision: useStudio.getState().revision + 1 });
    });

    expect(await screen.findByTestId("monaco-preview")).toHaveTextContent("after");
  });

  test("each pane hides behind its own control and comes back from its strip", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs);
    render(<Detail item={items.find((i) => i.slug === "playwright")!} />);
    await screen.findByRole("button", { name: "docs" });

    await userEvent.click(screen.getByRole("button", { name: "hide metadata" }));
    expect(screen.queryByTestId("meta-pane")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "show metadata" }));
    expect(screen.getByTestId("meta-pane")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "hide content" }));
    expect(screen.queryByRole("tree")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "show content" }));
    expect(await screen.findByRole("tree")).toBeInTheDocument();
  });

  test("the externalUrl is a forward link that asks before opening the browser", async () => {
    mockFs(registryFiles());
    onCommand("open_external", () => undefined);
    const { items } = await loadRegistry(fs);
    render(<Detail item={items.find((i) => i.slug === "pdf")!} />);

    await userEvent.click(screen.getByRole("button", { name: /github\.com\/anthropics/ }));
    // nothing opened yet — the dialog owns the decision (rendered by App; the store holds the URL)
    expect(invoke).not.toHaveBeenCalledWith("open_external", expect.anything());
    const { useExternalLink } = await import("@/core/externalUrl");
    expect(useExternalLink.getState().pending).toMatch(/^https:\/\/github\.com\/anthropics/);
    useExternalLink.getState().cancel();
  });

  test("shows a local:// registry as its value, not as a link that goes nowhere", async () => {
    mockFs(registryFiles());
    const { items } = await loadRegistry(fs);
    const playwright = items.find((i) => i.slug === "playwright")!;
    const served = { ...playwright, item: { ...playwright.item, externalUrl: "local://registry/mcp/playwright" } };

    render(<Detail item={served} />);

    expect(await screen.findByText("local://registry/mcp/playwright")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "local://registry/mcp/playwright" })).toBeNull();
  });
});

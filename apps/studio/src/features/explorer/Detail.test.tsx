import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { fs } from "@/api/fs";
import { invoke, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Detail } from "./Detail";
import { loadRegistry } from "./registry";

describe("Detail", () => {
  test("shows metadata, the file tree, the first file's preview, and opens it with the default app", async () => {
    mockFs(registryFiles());
    onCommand("open_path", () => undefined);
    const { items } = await loadRegistry(fs);
    const playwright = items.find((i) => i.slug === "playwright")!;

    render(<Detail item={playwright} />);

    expect(screen.getByRole("heading", { name: "Playwright" })).toBeInTheDocument();
    expect(screen.getByText("toolr")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "docs" })).toBeInTheDocument();

    // the first file is selected on its own and previewed (Monaco under jsdom is a <pre>)
    expect(await screen.findByTestId("monaco-preview")).toHaveTextContent("notes");

    // the plain-text toggle drops to the raw <pre>
    await userEvent.click(screen.getByRole("button", { name: "plain text" }));
    expect(screen.getByTestId("file-content")).toHaveTextContent("notes");

    await userEvent.click(screen.getByRole("button", { name: "mcp.md" }));
    expect(await screen.findByTestId("file-content")).toHaveTextContent("config");

    await userEvent.click(screen.getByRole("button", { name: /open with default app/ }));
    expect(invoke).toHaveBeenCalledWith("open_path", { rel: "registry/mcp/playwright/mcp.md" });
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
});

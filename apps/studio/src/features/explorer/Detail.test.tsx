import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { fs } from "@/api/fs";
import { invoke, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Detail } from "./Detail";
import { loadRegistry } from "./registry";

describe("Detail", () => {
  test("shows metadata, the file tree, a file's text, and opens it with the default app", async () => {
    mockFs(registryFiles());
    onCommand("open_path", () => undefined);
    const { items } = await loadRegistry(fs);
    const playwright = items.find((i) => i.slug === "playwright")!;

    render(<Detail item={playwright} />);

    expect(screen.getByRole("heading", { name: "Playwright" })).toBeInTheDocument();
    expect(screen.getByText("toolr")).toBeInTheDocument();
    expect(await screen.findByText("docs/")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "notes.md" }));
    expect(await screen.findByTestId("file-content")).toHaveTextContent("notes");

    await userEvent.click(screen.getByRole("button", { name: /open with default app/ }));
    expect(invoke).toHaveBeenCalledWith("open_path", { rel: "registry/mcp/playwright/docs/notes.md" });
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
});

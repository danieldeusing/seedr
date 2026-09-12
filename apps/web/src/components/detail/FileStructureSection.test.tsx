import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FileStructureSection } from "./FileStructureSection";
import type { FileTreeNode } from "@/lib/types";
import type { PreviewResult } from "@/lib/preview";

const RENDERED_HTML_TITLE = "Rendered HTML";

const files: FileTreeNode[] = [
  { name: "SKILL.md", type: "file" },
  { name: "docs.html", type: "file" },
  { name: "page.html", type: "file" },
  { name: "script.sh", type: "file" },
];

function loadFile(relativePath: string): Promise<PreviewResult> {
  if (relativePath === "SKILL.md") {
    return Promise.resolve({ kind: "text", text: "# Heading\n\nBody text.", language: "markdown", size: 20 });
  }
  if (relativePath === "docs.html") {
    return Promise.resolve({ kind: "text", text: "<h1>Docs</h1>", language: "html", size: 13 });
  }
  if (relativePath === "page.html") {
    return Promise.resolve({
      kind: "text",
      text: '<html><head><meta charset="utf-8"></head><body><h1>Page</h1></body></html>',
      language: "html",
      size: 73,
    });
  }
  return Promise.resolve({ kind: "text", text: "echo hi", language: "shell", size: 7 });
}

function renderSection(isFirstParty = false) {
  return render(
    <FileStructureSection
      files={files}
      rootName="skill-root"
      loadFile={loadFile}
      sourceHost="github.com"
      fileUrl={() => null}
      isFirstParty={isFirstParty}
    />
  );
}

describe("FileStructureSection formatted mode", () => {
  it("offers Formatted only for a markdown file, and renders it as markdown rather than raw text", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByText("SKILL.md"));
    const formattedButton = await screen.findByRole("button", { name: "Formatted" });
    await user.click(formattedButton);

    // Rendered markdown produces a real heading element, not the literal "# Heading" line.
    expect(await screen.findByRole("heading", { name: "Heading" })).toBeInTheDocument();
    expect(screen.queryByText("# Heading")).not.toBeInTheDocument();
  });

  it("offers Formatted for an HTML file, and renders it in a script-less sandboxed iframe", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByText("docs.html"));
    await user.click(await screen.findByRole("button", { name: "Formatted" }));

    const iframe = await screen.findByTitle(RENDERED_HTML_TITLE);
    // No token at all: no scripts, no same-origin access to this page, regardless
    // of what a community repository's HTML file contains.
    expect(iframe).toHaveAttribute("sandbox", "");
    // A <base target="_blank"> is prepended so any link click tries to open a new
    // tab rather than navigate this iframe away — and since the sandbox above
    // never grants allow-popups, that attempt does nothing instead of stranding
    // the preview on a blank or broken page.
    expect(iframe).toHaveAttribute("srcdoc", '<base target="_blank"><h1>Docs</h1>');
  });

  it("inserts the blocked-navigation base tag inside an existing <head>, rather than prepending it", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByText("page.html"));
    await user.click(await screen.findByRole("button", { name: "Formatted" }));

    const iframe = await screen.findByTitle(RENDERED_HTML_TITLE);
    expect(iframe).toHaveAttribute(
      "srcdoc",
      '<html><head><base target="_blank"><meta charset="utf-8"></head><body><h1>Page</h1></body></html>'
    );
  });

  it("allows scripts (but never same-origin access) in a first-party item's HTML preview", async () => {
    const user = userEvent.setup();
    renderSection(true);

    await user.click(screen.getByText("docs.html"));
    await user.click(await screen.findByRole("button", { name: "Formatted" }));

    const iframe = await screen.findByTitle(RENDERED_HTML_TITLE);
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  });

  it("does not offer Formatted for a non-markdown file", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByText("script.sh"));
    // "echo" is a shell keyword, so tokenizing splits it into its own span —
    // match the panel's full text rather than an exact node.
    await waitFor(() => expect(screen.getByTestId("preview-panel").textContent).toContain("echo hi"));
    expect(screen.queryByRole("button", { name: "Formatted" })).not.toBeInTheDocument();
  });

  it("falls back to syntax when Formatted was selected and a non-markdown file is opened next", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByText("SKILL.md"));
    await user.click(await screen.findByRole("button", { name: "Formatted" }));
    await screen.findByRole("heading", { name: "Heading" });

    await user.click(screen.getByText("script.sh"));
    // "echo" is a shell keyword, so tokenizing splits it into its own span —
    // match the panel's full text rather than an exact node.
    await waitFor(() => expect(screen.getByTestId("preview-panel").textContent).toContain("echo hi"));
    expect(screen.getByRole("button", { name: "Syntax highlighting" })).toHaveAttribute("aria-pressed", "true");
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FileStructureSection } from "./FileStructureSection";
import type { FileTreeNode } from "@/lib/types";
import type { PreviewResult } from "@/lib/preview";

const files: FileTreeNode[] = [
  { name: "SKILL.md", type: "file" },
  { name: "script.sh", type: "file" },
];

function loadFile(relativePath: string): Promise<PreviewResult> {
  if (relativePath === "SKILL.md") {
    return Promise.resolve({ kind: "text", text: "# Heading\n\nBody text.", language: "markdown", size: 20 });
  }
  return Promise.resolve({ kind: "text", text: "echo hi", language: "shell", size: 7 });
}

function renderSection() {
  return render(
    <FileStructureSection
      files={files}
      rootName="skill-root"
      loadFile={loadFile}
      sourceHost="github.com"
      fileUrl={() => null}
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

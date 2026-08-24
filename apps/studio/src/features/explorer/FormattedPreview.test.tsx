import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { useExternalLink } from "@/core/externalUrl";
import { FormattedPreview } from "./FormattedPreview";

beforeEach(() => {
  useExternalLink.setState({ pending: null });
});

describe("FormattedPreview", () => {
  test("renders markdown; links go through the browser dialog; images fetch nothing", async () => {
    render(
      <FormattedPreview content={"# Title\n\nSome `code` here.\n\n[docs](https://example.com/docs)\n\n[bad](javascript:alert(1))\n\n![logo](https://example.com/logo.png)"} />
    );

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();

    // a safe link only *requests*; nothing opens without the dialog
    await userEvent.click(screen.getByRole("button", { name: "docs" }));
    expect(useExternalLink.getState().pending).toBe("https://example.com/docs");

    // a scheme the shell will not be given has nothing to click
    expect(screen.queryByRole("button", { name: "bad" })).toBeNull();
    expect(screen.getByText("bad")).toBeInTheDocument();

    // no <img> is ever created from previewed content
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/image: logo/)).toBeInTheDocument();
  });
});

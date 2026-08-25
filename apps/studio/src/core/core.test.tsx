import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { invoke, onCommand } from "@/test/mockIpc";
import { AppHeader } from "./AppHeader";
import { Modal } from "./Modal";
import { ExternalLinkDialog } from "./ExternalLinkDialog";
import { safeExternalUrl, useExternalLink } from "./externalUrl";
import { ThemeMenu } from "./ThemeMenu";

// This jsdom build ships window.localStorage as an empty object; the components
// only need the Storage contract, so the tests provide it.
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, String(value)),
    removeItem: (key: string) => void stored.delete(key),
  },
});

const PAGE = "https://example.com/page";

beforeEach(() => {
  document.documentElement.dataset.theme = "warm";
  stored.clear();
  useExternalLink.setState({ pending: null });
});

describe("ThemeMenu", () => {
  test("offers all four themes in a dropdown, applies and persists the choice", async () => {
    render(<ThemeMenu />);
    const summary = screen.getByText((_, el) => el?.tagName === "SUMMARY" && el.getAttribute("aria-label") === "theme: warm");
    await userEvent.click(summary);
    expect(screen.getByRole("menu", { name: "theme" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("menuitem", { name: "green" }));
    expect(document.documentElement.dataset.theme).toBe("green");
    expect(stored.get("theme")).toBe("green");
  });
});

describe("safeExternalUrl", () => {
  test("passes http(s) and mailto, refuses everything a scheme can hide behind", () => {
    expect(safeExternalUrl("https://github.com/x")).toBe("https://github.com/x");
    expect(safeExternalUrl("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(safeExternalUrl("data:text/html,x")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
    expect(safeExternalUrl("/relative")).toBeNull();
  });
});

describe("ExternalLinkDialog", () => {
  test("shows the URL, opens only on confirm, and cancels on Escape", async () => {
    onCommand("open_external", () => undefined);
    render(<ExternalLinkDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();

    useExternalLink.getState().request(PAGE);
    expect(await screen.findByRole("dialog", { name: "open in browser" })).toHaveTextContent(PAGE);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith("open_external", expect.anything());

    useExternalLink.getState().request(PAGE);
    await userEvent.click(await screen.findByRole("button", { name: "open in browser" }));
    expect(invoke).toHaveBeenCalledWith("open_external", { url: PAGE });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a link with a refused scheme never even raises the dialog", () => {
    render(<ExternalLinkDialog />);
    useExternalLink.getState().request("javascript:alert(1)");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("AppHeader", () => {
  test("is the identity strip and nothing else", () => {
    render(<AppHeader />);
    expect(screen.getByText("seedr-studio")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Modal", () => {
  test("every size stops at the viewport, so its own scroll area is the one that moves", () => {
    for (const size of ["lg", "xl", "full"] as const) {
      const { unmount } = render(
        <Modal title="settings" size={size} onClose={() => {}}>
          <p>tall</p>
        </Modal>
      );
      const panel = screen.getByRole("dialog").querySelector("div.relative");
      expect(panel?.className).toMatch(/max-h-\[90vh\]|h-\[90vh\]/);
      unmount();
    }
  });

  test("Escape and the backdrop both dismiss", async () => {
    const onClose = vi.fn();
    render(
      <Modal title="settings" onClose={onClose}>
        <p>body</p>
      </Modal>
    );

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("dialog").querySelector("div.absolute")!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

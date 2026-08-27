import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { invoke, onCommand } from "@/test/mockIpc";
import { AgentLog, blocksOf } from "./ui/AgentLog";
import { AppHeader } from "./AppHeader";
import { Modal } from "./Modal";
import { originSlug } from "./RepoBadge";
import { useStudio } from "@/features/explorer/store";
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
    useStudio.setState({ repo: null });
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

describe("RepoBadge", () => {
  const CONFIG = '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = git@github.com:danieldeusing/seedr.git\n\tfetch = +refs/heads/*\n[branch "main"]\n';
  const FORK = "/Users/me/forks/seedr-fork";

  test("reads owner/repo from either URL spelling, and copes with no remote", () => {
    expect(originSlug(CONFIG)).toBe("danieldeusing/seedr");
    expect(originSlug('[remote "origin"]\n\turl = https://github.com/obra/superpowers\n')).toBe("obra/superpowers");
    expect(originSlug('[remote "upstream"]\n\turl = git@github.com:someone/else.git\n')).toBeNull();
    expect(originSlug("[core]\n\tbare = false\n")).toBeNull();
  });

  test("says nothing while Studio is on the default checkout", () => {
    useStudio.setState({ repo: { root: "/Users/me/seedr", name: "seedr", isDefault: true, hasOps: true } });
    render(<AppHeader />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("anywhere else it warns and names the folder and its remote, and offers no way to agree", async () => {
    onCommand("read_text", () => CONFIG);
    useStudio.setState({ repo: { root: FORK, name: "seedr-fork", isDefault: false, hasOps: true } });

    render(<AppHeader />);

    expect(screen.getByRole("alert")).toHaveTextContent(`Attention: outside the default folder — ${FORK}`);
    expect(await screen.findByText("danieldeusing/seedr")).toBeInTheDocument();
    expect(screen.getByText(/outside the default folder/)).toHaveAttribute("data-tip", FORK);

    // Dismissing a warning next to the warning is agreement, not a decision —
    // the default checkout is changed in settings instead.
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("shows nothing before a checkout is open", () => {
    useStudio.setState({ repo: null });
    render(<AppHeader />);
    expect(screen.getByText("seedr-studio")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Modal focus", () => {
  test("keeps focus inside once open, even as the caller re-renders", async () => {
    function Host() {
      const [text, setText] = useState("");
      // A fresh arrow every render, which is what most callers pass.
      return (
        <Modal title="typing" onClose={() => {}}>
          <input aria-label="field" value={text} onChange={(event) => setText(event.target.value)} />
        </Modal>
      );
    }
    render(<Host />);

    const field = screen.getByLabelText("field");
    await userEvent.type(field, "the-code");

    // Re-focusing on every render truncated this to its first character.
    expect(field).toHaveValue("the-code");
  });
});

describe("AgentLog", () => {
  test("holds ten lines whether or not there are ten, and follows the newest", () => {
    const { rerender } = render(<AgentLog lines={["● Todo added 5 items"]} />);

    const view = screen.getByLabelText("agent output");
    // A box that grows from one line makes the first message look like the
    // whole story; the floor is stated in lines, not pixels.
    expect(view.className).toContain("min-h-[calc(10*1.45em+1rem)]");
    expect(view).toHaveTextContent("Todo added 5 items");

    rerender(<AgentLog lines={["one", "two", "three"]} />);
    expect(screen.getByLabelText("agent output")).toHaveTextContent("one two three");
  });

  test("renders what the agent said as the markdown it wrote, and a tool call as one line", () => {
    render(
      <AgentLog
        lines={[
          "· Read AGENTS.md",
          "## Gotchas",
          "",
          "- **pnpm only** — use `pnpm`",
          "",
          "```json",
          '{ "slug": "pdf" }',
          "```",
        ]}
      />
    );

    // A heading was arriving as the characters `## Gotchas`.
    expect(screen.getByRole("heading", { name: "Gotchas" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("pnpm only");
    // A fenced block only means anything whole, so the lines must not be split.
    expect(screen.getByText('{ "slug": "pdf" }')).toBeInTheDocument();
    // The trace stays a trace: no markdown, no reflow.
    expect(screen.getByText("· Read AGENTS.md").tagName).toBe("PRE");
  });

  test("groups consecutive lines of the same kind, and only those", () => {
    expect(blocksOf(["· one", "· two", "said", "more", "· three"])).toEqual([
      { tool: true, lines: ["· one", "· two"] },
      { tool: false, text: "said\nmore" },
      { tool: true, lines: ["· three"] },
    ]);
  });

  test("shows nothing at all before there is output", () => {
    render(<AgentLog lines={[]} />);
    expect(screen.queryByLabelText("agent output")).not.toBeInTheDocument();
  });
});

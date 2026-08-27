import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { invoke, onCommand } from "@/test/mockIpc";
import { batchedLog, plainLine, type LogLine } from "@/core/logLines";
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
  const said = (text: string) => ({ kind: "markdown" as const, text });
  const printed = (text: string) => ({ kind: "text" as const, text });

  test("holds ten lines whether or not there are ten, and follows the newest", () => {
    const { rerender } = render(<AgentLog lines={[printed("● Todo added 5 items")]} />);

    const view = screen.getByLabelText("agent output");
    // A box that grows from one line makes the first message look like the
    // whole story, so it opens at ten lines' worth.
    expect(view).toHaveStyle({ height: "190px" });
    expect(view).toHaveTextContent("Todo added 5 items");

    rerender(<AgentLog lines={["one", "two", "three"].map(printed)} />);
    for (const text of ["one", "two", "three"]) expect(screen.getByText(text)).toBeInTheDocument();
  });

  test("renders what the agent said as markdown, and what a tool printed as lines", () => {
    render(
      <AgentLog
        lines={[
          said("## Gotchas\n\n- **pnpm only** — use `pnpm`"),
          // codex and opencode report every line this way. As markdown these
          // collapsed into one paragraph and the indented JSON became a wall of
          // separate code blocks — the output stopped being readable.
          printed("ROOT_RULE_FILES ./.claude/rules/turbo-monorepo.md"),
          printed('  { "name": "SKILL.md" }'),
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Gotchas" })).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("pnpm only");

    // Each plain line is its own block, so an arriving line adds one element
    // rather than rebuilding every line above it.
    expect(screen.getByText(/ROOT_RULE_FILES/).tagName).toBe("PRE");
    expect(screen.getByText('{ "name": "SKILL.md" }').tagName).toBe("PRE");
  });

  test("drags taller, and opens where it was left", async () => {
    render(<AgentLog lines={[printed("one")]} />);
    const view = screen.getByLabelText("agent output");
    expect(view).toHaveStyle({ height: "190px" });

    fireEvent.mouseDown(screen.getByLabelText("resize agent output"), { clientY: 400 });
    fireEvent.mouseMove(document, { clientY: 560 });
    fireEvent.mouseUp(document);
    expect(view).toHaveStyle({ height: "350px" });

    // Ten lines is a start, not a ceiling: the next run opens at 350.
    await waitFor(() => expect(localStorage.getItem("studio-agent-log-height")).toBe("350"));
  });

  test("joins markdown so a fence survives, and leaves plain lines apart so they are cheap", () => {
    expect(blocksOf([said("# a"), said("more"), printed("b"), printed("c")])).toEqual([
      // Markdown only means anything whole.
      { markdown: true, text: "# a\nmore", repeats: 1 },
      // Plain lines stay separate: joined, a streaming agent grew one enormous
      // element that React rebuilt on every line, and the controls stopped
      // answering.
      { markdown: false, text: "b", repeats: 1 },
      { markdown: false, text: "c", repeats: 1 },
    ]);
  });

  test("gathers the runtime's own errors, counted rather than repeated", () => {
    // Verbatim shape from a run: a broken MCP server logs the same failure on
    // every model call, in tracing's format on stderr.
    const mcp = (stamp: string, host: string) => ({
      kind: "error" as const,
      text: `${stamp} ERROR rmcp::transport::worker: worker quit with fatal: AuthRequired(${host})`,
    });
    const blocks = blocksOf([
      mcp("2026-08-27T01:51:31.217654Z", "mcp.notion.com"),
      mcp("2026-08-27T01:51:31.353846Z", "mcp.linear.app"),
      mcp("2026-08-27T01:52:02.100000Z", "mcp.notion.com"),
      mcp("2026-08-27T01:52:02.200000Z", "mcp.linear.app"),
      said("done"),
    ]);

    // One group of two distinct failures, each seen twice — not four lines
    // between the reader and the sentence that follows.
    expect(blocks[0]?.group).toBe("error");
    expect(blocks[0]?.entries).toHaveLength(2);
    expect(blocks[0]?.entries?.map((e) => e.repeats)).toEqual([2, 2]);
    expect(blocks[1]?.markdown).toBe(true);
  });

  test("shows a repeated message once, with how many times it came", () => {
    // Verbatim from a run: a broken MCP server reports the same auth failure on
    // every model call, and ten of an eighteen-line log said one thing.
    const mcp = (stamp: string, host: string) =>
      printed(`${stamp} ERROR rmcp::transport::worker: worker quit with fatal: AuthRequired(${host})`);
    const blocks = blocksOf([
      mcp("2026-08-27T01:21:31.739829Z", "mcp.notion.com"),
      mcp("2026-08-27T01:21:31.785706Z", "mcp.linear.app"),
      mcp("2026-08-27T01:22:14.908055Z", "mcp.linear.app"),
      mcp("2026-08-27T01:22:25.003106Z", "mcp.notion.com"),
    ]);

    // Two distinct failures, not four events: the timestamp is what made them
    // look different, so it is not what they are compared by.
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.repeats)).toEqual([2, 2]);
  });

  test("gathers consecutive calls into one group, keeping every one of them", () => {
    const call = (detail: string) => ({ kind: "tool" as const, text: "bash", detail });
    const blocks = blocksOf([call("echo hello"), call("echo hello"), said("done"), call("ls")]);

    // Two identical calls really did happen twice, so both are kept — they are
    // events, not a repeated message. The prose splits the groups.
    expect(blocks[0]?.entries).toHaveLength(2);
    expect(blocks[1]?.markdown).toBe(true);
    expect(blocks[2]?.entries).toHaveLength(1);
  });

  test("leaves every earlier block alone when a line arrives", () => {
    const before = blocksOf([printed("a"), printed("b")]);
    const after = blocksOf([printed("a"), printed("b"), printed("c")]);
    // Same values in the same places, so the memoised blocks bail out and only
    // the new one is rendered.
    expect(after.slice(0, before.length)).toEqual(before);
  });

  test("hands a frame's worth of lines over at once, dropping none", async () => {
    const batches: LogLine[][] = [];
    const push = batchedLog((lines) => batches.push(lines));

    for (const text of ["a", "b", "c"]) push(plainLine(text));
    // Still the same frame: one update will carry all three, where before each
    // line was its own store update and its own render of the whole panel.
    expect(batches).toHaveLength(0);

    await new Promise(requestAnimationFrame);
    expect(batches).toEqual([[plainLine("a"), plainLine("b"), plainLine("c")]]);

    push(plainLine("d"));
    await new Promise(requestAnimationFrame);
    expect(batches).toHaveLength(2);
  });

  test("shows nothing at all before there is output", () => {
    render(<AgentLog lines={[]} />);
    expect(screen.queryByLabelText("agent output")).not.toBeInTheDocument();
  });
});

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { BrowserRouter, NavigationType, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { EMPTY_HISTORY, NavigationProvider, historyReducer, useNavigation, type HistoryEntry } from "./NavigationContext";
import { getItem } from "@/lib/registry";

const PDF = getItem("pdf", "skill")!.name;

/** Exposes the navigation state as text and the router's navigate() as buttons. */
function Probe() {
  const nav = useNavigation();
  const navigate = useNavigate();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();
  return (
    <div>
      <output data-testid="state">
        {JSON.stringify({
          path: location.pathname + location.search,
          index: nav.currentHistoryIndex,
          count: nav.historyEntries.length,
          back: nav.canGoBack,
          forward: nav.canGoForward,
          crumbs: nav.segments.map((s) => s.label),
          entries: nav.historyEntries.map((e) => e.map((s) => s.label).join(">")),
        })}
      </output>
      <button onClick={() => navigate("/skills")}>push-skills</button>
      <button onClick={() => navigate("/skills/pdf")}>push-pdf</button>
      <button onClick={() => navigate("/hooks")}>push-hooks</button>
      <button onClick={() => navigate("/skills?q=pdf", { replace: true })}>replace-query</button>
      <button onClick={() => setSearchParams({ tool: "claude" }, { replace: true })}>set-params</button>
      <button onClick={nav.goBack}>seedr-back</button>
      <button onClick={nav.goForward}>seedr-forward</button>
      <button onClick={() => nav.goToHistory(0)}>history-0</button>
      <button onClick={() => nav.segments.find((s) => s.id === "skill")?.onClick?.()}>crumb-skills</button>
    </div>
  );
}

function readState() {
  return JSON.parse(screen.getByTestId("state").textContent ?? "{}") as {
    path: string;
    index: number;
    count: number;
    back: boolean;
    forward: boolean;
    crumbs: string[];
    entries: string[];
  };
}

function renderApp() {
  return render(
    <BrowserRouter>
      <NavigationProvider>
        <Probe />
      </NavigationProvider>
    </BrowserRouter>
  );
}

const browserBack = () => act(async () => {
  window.history.back();
  await new Promise((resolve) => setTimeout(resolve, 20));
});
const browserForward = () => act(async () => {
  window.history.forward();
  await new Promise((resolve) => setTimeout(resolve, 20));
});

describe("NavigationProvider (browser history is the only history)", () => {
  beforeEach(() => {
    // a fresh current entry without React Router's idx, as on a direct load
    window.history.replaceState(null, "", "/");
  });

  it("starts with a single entry on a direct load", () => {
    renderApp();
    expect(readState()).toMatchObject({ path: "/", index: 0, count: 1, back: false, forward: false, crumbs: ["Home"] });
  });

  it("appends on push and moves the cursor on browser Back/Forward without appending", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText("push-skills"));
    await user.click(screen.getByText("push-pdf"));
    expect(readState()).toMatchObject({ path: "/skills/pdf", index: 2, count: 3, back: true, forward: false });
    expect(readState().crumbs).toEqual(["Home", "Skills", PDF]);

    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills", index: 1, count: 3, back: true, forward: true }));

    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/", index: 0, count: 3, back: false, forward: true }));

    await browserForward();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills", index: 1, count: 3, back: true, forward: true }));
  });

  it("drives the browser history from Seedr's own Back/Forward controls", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText("push-skills"));
    await user.click(screen.getByText("push-pdf"));

    await act(async () => {
      await user.click(screen.getByText("seedr-back"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills", index: 1, count: 3, forward: true }));
    expect(window.location.pathname).toBe("/skills");

    await act(async () => {
      await user.click(screen.getByText("seedr-forward"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills/pdf", index: 2, count: 3, forward: false }));
    expect(window.location.pathname).toBe("/skills/pdf");

    // browser Back after Seedr Forward lands on the same entry either way
    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills", index: 1 }));
  });

  it("replaces the current entry for replace navigations and query-only changes", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText("push-skills"));
    expect(readState()).toMatchObject({ path: "/skills", index: 1, count: 2 });

    await user.click(screen.getByText("replace-query"));
    expect(readState()).toMatchObject({ path: "/skills?q=pdf", index: 1, count: 2, back: true, forward: false });

    await user.click(screen.getByText("set-params"));
    expect(readState()).toMatchObject({ path: "/skills?tool=claude", index: 1, count: 2 });

    // the replaced URL is what browser Back returns to later
    await user.click(screen.getByText("push-pdf"));
    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/skills?tool=claude", index: 1, count: 3 }));
  });

  it("truncates forward entries when a new page is pushed after going back", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText("push-skills"));
    await user.click(screen.getByText("push-pdf"));
    await browserBack();
    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/", index: 0, count: 3 }));

    await user.click(screen.getByText("push-hooks"));
    expect(readState()).toMatchObject({ path: "/hooks", index: 1, count: 2, back: true, forward: false });
    expect(readState().entries).toEqual(["Home", "Home>Hooks"]);
  });

  it("records category → detail → category transitions and jumps through the history list", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByText("push-skills"));
    await user.click(screen.getByText("push-pdf"));
    await user.click(screen.getByText("crumb-skills"));
    expect(readState()).toMatchObject({ path: "/skills", index: 3, count: 4 });
    expect(readState().entries).toEqual(["Home", "Home>Skills", `Home>Skills>${PDF}`, "Home>Skills"]);

    await act(async () => {
      await user.click(screen.getByText("history-0"));
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await waitFor(() => expect(readState()).toMatchObject({ path: "/", index: 0, count: 4, forward: true }));
  });

  it("slots in entries it never saw (created before a reload) by their browser index", async () => {
    // a session that navigated before this page instance existed
    window.history.replaceState({ usr: null, key: "a", idx: 4 }, "", "/hooks");
    window.history.pushState({ usr: null, key: "b", idx: 5 }, "", "/skills/pdf");
    renderApp();
    expect(readState()).toMatchObject({ path: "/skills/pdf", index: 0, count: 1, back: false });

    await browserBack();
    await waitFor(() => expect(readState()).toMatchObject({ path: "/hooks", index: 0, count: 2, back: false, forward: true }));
    expect(readState().entries).toEqual(["Home>Hooks", `Home>Skills>${PDF}`]);
  });
});

describe("historyReducer", () => {
  const entry = (idx: number, path = `/p${idx}`): HistoryEntry => ({ idx, path, state: null, segments: [] });

  it("handles push, replace and pop in order", () => {
    let state = historyReducer(EMPTY_HISTORY, { type: "sync", navigationType: NavigationType.Pop, entry: entry(0) });
    state = historyReducer(state, { type: "sync", navigationType: NavigationType.Push, entry: entry(1) });
    state = historyReducer(state, { type: "sync", navigationType: NavigationType.Push, entry: entry(2) });
    expect(state.entries.map((e) => e.idx)).toEqual([0, 1, 2]);
    expect(state.currentIndex).toBe(2);

    state = historyReducer(state, { type: "sync", navigationType: NavigationType.Replace, entry: entry(2, "/p2?x=1") });
    expect(state.entries[2]?.path).toBe("/p2?x=1");
    expect(state.currentIndex).toBe(2);

    state = historyReducer(state, { type: "sync", navigationType: NavigationType.Pop, entry: entry(0) });
    expect(state.currentIndex).toBe(0);
    expect(state.entries).toHaveLength(3);

    state = historyReducer(state, { type: "sync", navigationType: NavigationType.Push, entry: entry(1, "/other") });
    expect(state.entries.map((e) => e.path)).toEqual(["/p0", "/other"]);
    expect(state.currentIndex).toBe(1);
  });

  it("is idempotent for a repeated sync of the same entry (StrictMode)", () => {
    const once = historyReducer(EMPTY_HISTORY, { type: "sync", navigationType: NavigationType.Pop, entry: entry(0) });
    const twice = historyReducer(once, { type: "sync", navigationType: NavigationType.Pop, entry: entry(0) });
    expect(twice.entries).toHaveLength(1);
    const pushed = historyReducer(twice, { type: "sync", navigationType: NavigationType.Push, entry: entry(1) });
    const pushedAgain = historyReducer(pushed, { type: "sync", navigationType: NavigationType.Push, entry: entry(1) });
    expect(pushedAgain.entries).toHaveLength(2);
  });
});

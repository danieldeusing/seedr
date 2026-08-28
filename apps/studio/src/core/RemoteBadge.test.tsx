import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import type { RemoteState } from "@/api/git";
import { useStudio } from "@/features/explorer/store";
import { RemoteBadge } from "./RemoteBadge";

const show = (remote: RemoteState | null, remoteChecking = false) => {
  useStudio.setState({ remote, remoteChecking });
  render(<RemoteBadge />);
};

const level: RemoteState = { upstream: "origin/main", behind: 0, ahead: 0, fetched: true, fetchError: null };

describe("the title bar's remote state", () => {
  beforeEach(() => useStudio.setState({ remote: null, remoteChecking: false }));

  test("says nothing when the checkout is level with its upstream", () => {
    // Silence is the normal state; a badge that is always lit is never read.
    // State first, THEN render: setting it afterwards would leave an empty
    // container that proves nothing, since a component rendering nothing at all
    // would pass just as well.
    useStudio.setState({ remote: level });
    const { container } = render(<RemoteBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  test("names how far behind, and what to do about it", () => {
    show({ ...level, behind: 3 });
    expect(screen.getByRole("alert")).toHaveTextContent("3 behind origin/main — pull");
  });

  test("compares against whatever the branch tracks", () => {
    show({ ...level, upstream: "origin/prod", behind: 1 });
    expect(screen.getByRole("alert")).toHaveTextContent("1 behind origin/prod");
  });

  test("unpushed work is mentioned quietly — the other host cannot see it yet", () => {
    show({ ...level, ahead: 2 });
    expect(screen.getByText("2 unpushed")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("a fetch that did not get through says so, and never claims up to date", () => {
    // 0 behind from a checkout that never reached the remote is the false
    // reassurance this badge exists to prevent.
    show({ ...level, fetched: false, fetchError: "could not resolve host" });
    expect(screen.getByRole("status")).toHaveTextContent("could not reach origin/main — this list may be stale");
  });

  test("a branch with no upstream shows nothing", () => {
    useStudio.setState({ remote: { upstream: null, behind: 0, ahead: 0, fetched: false, fetchError: null } });
    const { container } = render(<RemoteBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { onCommand } from "@/test/mockIpc";
import { RepoMenu } from "./RepoMenu";
import { forgetRepo, readHistory, rememberRepo, repoLabel } from "./repoHistory";
import { useStudio } from "./store";

const HOME = "/Users/daniel/Work/danieldeusing/apps/seedr";
const FORK = "/Users/daniel/Work/danieldeusing/apps/seedr-internal";

const info = (root: string) => ({ root, isDefault: root === HOME, hasOps: true, registryDir: "registry" });

beforeEach(() => {
  localStorage.clear();
  useStudio.setState({ repo: info(FORK) as never });
  onCommand("default_repo", () => info(HOME));
});

describe("the history itself", () => {
  test("most recent first, no duplicates, and re-opening moves it to the front", () => {
    rememberRepo("/a");
    rememberRepo("/b");
    rememberRepo("/a");
    expect(readHistory()).toEqual(["/a", "/b"]);
  });

  test("a path that no longer opens is forgotten rather than left to fail again", () => {
    rememberRepo("/a");
    rememberRepo("/gone");
    expect(forgetRepo("/gone")).toEqual(["/a"]);
  });

  test("the label is the folder, not the whole path", () => {
    expect(repoLabel(FORK)).toBe("seedr-internal");
    expect(repoLabel("/trailing/slash/")).toBe("slash");
  });
});

describe("the switch-repo menu", () => {
  test("offers the picker, the default by name, and where it has been", async () => {
    rememberRepo("/Users/daniel/other-fork");
    rememberRepo(FORK);
    render(<RepoMenu />);
    await userEvent.click(screen.getByLabelText("switch repo"));

    expect(await screen.findByRole("menuitem", { name: "Open…" })).toBeInTheDocument();
    expect(await screen.findByRole("menuitem", { name: "default (seedr)" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "other-fork" })).toBeInTheDocument();
    // The open one is marked, and listed once rather than again under history.
    expect(screen.getByRole("menuitem", { name: "seedr-internal" })).toHaveAttribute("aria-current", "true");
  });

  test("choosing a history entry opens it by path, without the native picker", async () => {
    const opened = vi.fn(() => info("/Users/daniel/other-fork"));
    onCommand("open_repo_at", opened);
    onCommand("pick_repo", () => {
      throw new Error("the native picker must not open for a path already known");
    });
    rememberRepo("/Users/daniel/other-fork");

    render(<RepoMenu />);
    await userEvent.click(screen.getByLabelText("switch repo"));
    await userEvent.click(await screen.findByRole("menuitem", { name: "other-fork" }));

    expect(opened).toHaveBeenCalled();
  });
});

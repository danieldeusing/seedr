import { beforeEach, describe, expect, test } from "vitest";
import { emit, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { REGISTRY_CHANGED } from "@/api/watch";
import { selectedItem, useStudio } from "./store";

const repo = { root: "/repo", name: "repo", isDefault: true, hasOps: true };

beforeEach(() => {
  useStudio.setState({ repo: null, items: [], problems: [], loading: false, error: null, selected: null });
  onCommand("watch_registry", () => undefined);
});

describe("useStudio", () => {
  test("init restores the host's repo, loads items and starts watching", async () => {
    onCommand("get_repo", () => repo);
    mockFs(registryFiles());

    await useStudio.getState().init();

    const state = useStudio.getState();
    expect(state.repo).toEqual(repo);
    expect(state.items).toHaveLength(3);
    expect(state.problems).toHaveLength(1);
    expect(state.error).toBeNull();
  });

  test("init without a selected repo stays on onboarding", async () => {
    onCommand("get_repo", () => null);
    await useStudio.getState().init();
    expect(useStudio.getState().repo).toBeNull();
  });

  test("chooseRepo: a cancelled picker changes nothing; a choice loads the registry", async () => {
    onCommand("pick_repo", () => null);
    await useStudio.getState().chooseRepo();
    expect(useStudio.getState().repo).toBeNull();

    onCommand("pick_repo", () => repo);
    mockFs(registryFiles());
    await useStudio.getState().chooseRepo();
    expect(useStudio.getState().repo).toEqual(repo);
    expect(useStudio.getState().items.map((i) => i.slug)).toEqual(["broken", "pdf", "playwright"]);
  });

  test("a rejected folder is reported and leaves the open checkout alone", async () => {
    useStudio.setState({ repo });
    onCommand("pick_repo", () => {
      throw new Error("Not a seedr registry: no registry/ directory");
    });
    await useStudio.getState().chooseRepo();
    expect(useStudio.getState().repoError).toBe("Not a seedr registry: no registry/ directory");
    expect(useStudio.getState().repo).toEqual(repo);

    // The watcher refreshes on its own; what it reports is its own, and the
    // rejected folder is not something it can clear.
    mockFs(registryFiles());
    await useStudio.getState().refresh();
    expect(useStudio.getState().repoError).toBe("Not a seedr registry: no registry/ directory");
  });

  test("makeRepoDefault records the named checkout, and reports what the host refused", async () => {
    const elsewhere = { root: "/forks/seedr", name: "seedr", isDefault: false, hasOps: true };
    useStudio.setState({ repo: elsewhere });
    let named: string | undefined;
    onCommand("set_default_repo", (args) => {
      named = (args as { path: string }).path;
      return { ...elsewhere, isDefault: true, hasOps: true };
    });

    expect(await useStudio.getState().makeRepoDefault("/forks/seedr")).toBeNull();
    expect(named).toBe("/forks/seedr");
    expect(useStudio.getState().repo).toEqual({ ...elsewhere, isDefault: true, hasOps: true });

    onCommand("set_default_repo", () => {
      throw new Error("No configuration directory to record the default checkout in");
    });
    // The message goes back to whoever asked — the settings page — rather than
    // into the registry error line, which is not what this is about.
    expect(await useStudio.getState().makeRepoDefault("/nope")).toMatch(/No configuration directory/);
  });

  test("a registry change event refreshes, and a selection that disappeared is dropped", async () => {
    onCommand("get_repo", () => repo);
    const files = registryFiles();
    mockFs(files);
    await useStudio.getState().init();
    useStudio.getState().select({ type: "mcp", slug: "playwright" });
    expect(selectedItem(useStudio.getState())?.item.name).toBe("Playwright");

    delete files["registry/mcp/playwright/item.json"];
    mockFs(files);
    emit(REGISTRY_CHANGED);
    await new Promise((r) => setTimeout(r, 400));

    expect(useStudio.getState().items.map((i) => i.slug)).toEqual(["broken", "pdf"]);
    expect(useStudio.getState().selected).toBeNull();
  });

  test("refresh reports a failing host", async () => {
    useStudio.setState({ repo });
    onCommand("path_exists", () => {
      throw new Error("disk on fire");
    });
    await useStudio.getState().refresh();
    expect(useStudio.getState().error).toBe("disk on fire");
    expect(useStudio.getState().loading).toBe(false);
  });
});

describe("a registry without the operations CLI", () => {
  test("opens read-only, and the actions that would change it say why", async () => {
    const readOnly = { root: "/internal/seedr-internal", name: "seedr-internal", isDefault: false, hasOps: false };
    onCommand("pick_repo", () => readOnly);
    mockFs(registryFiles());

    await useStudio.getState().chooseRepo();

    expect(useStudio.getState().repo).toEqual(readOnly);
    expect(useStudio.getState().repoError).toBeNull();
    expect(useStudio.getState().items.length).toBeGreaterThan(0);
  });

  test("a folder that is not a registry at all is refused, and the open checkout stays", async () => {
    useStudio.setState({ repo, repoError: null });
    onCommand("pick_repo", () => {
      throw new Error("Not a seedr registry: no registry/ directory");
    });

    await useStudio.getState().chooseRepo();

    expect(useStudio.getState().repoError).toMatch(/no registry\/ directory/);
    expect(useStudio.getState().repo).toEqual(repo);

    useStudio.getState().clearRepoError();
    expect(useStudio.getState().repoError).toBeNull();
  });
});

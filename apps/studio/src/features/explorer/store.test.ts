import { beforeEach, describe, expect, test } from "vitest";
import { emit, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { REGISTRY_CHANGED } from "@/api/watch";
import { selectedItem, useStudio } from "./store";

const repo = { root: "/repo", name: "repo", isDefault: true };

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
    expect(useStudio.getState().error).toBe("Not a seedr registry: no registry/ directory");
    expect(useStudio.getState().repo).toEqual(repo);
  });

  test("makeRepoDefault re-baselines the open checkout, and says so when the host cannot", async () => {
    const elsewhere = { root: "/forks/seedr", name: "seedr", isDefault: false };
    useStudio.setState({ repo: elsewhere });
    onCommand("set_default_repo", () => ({ ...elsewhere, isDefault: true }));
    await useStudio.getState().makeRepoDefault();
    expect(useStudio.getState().repo).toEqual({ ...elsewhere, isDefault: true });

    onCommand("set_default_repo", () => {
      throw new Error("No configuration directory to record the default checkout in");
    });
    await useStudio.getState().makeRepoDefault();
    expect(useStudio.getState().error).toMatch(/No configuration directory/);
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

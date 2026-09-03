import { beforeEach, describe, expect, test } from "vitest";
import { emit, mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import type { RunRequest } from "@/api/agent";
import { REGISTRY_CHANGED } from "@/api/watch";
import { REGISTRY_OP_TIMEOUT_MS } from "@/api/registryCli";
import { selectedItem, useStudio } from "./store";

const repo = { root: "/repo", name: "repo", isDefault: true, hasOps: true, registryDir: "registry" };

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
    const elsewhere = { root: "/forks/seedr", name: "seedr", isDefault: false, hasOps: true, registryDir: "registry" };
    useStudio.setState({ repo: elsewhere });
    let named: string | undefined;
    onCommand("set_default_repo", (args) => {
      named = (args as { path: string }).path;
      return { ...elsewhere, isDefault: true, hasOps: true, registryDir: "registry" };
    });

    expect(await useStudio.getState().makeRepoDefault("/forks/seedr")).toBeNull();
    expect(named).toBe("/forks/seedr");
    expect(useStudio.getState().repo).toEqual({ ...elsewhere, isDefault: true, hasOps: true, registryDir: "registry" });

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
    const readOnly = { root: "/internal/seedr-internal", name: "seedr-internal", isDefault: false, hasOps: false, registryDir: "registry" };
    onCommand("pick_repo", () => readOnly);
    mockFs(registryFiles());

    await useStudio.getState().chooseRepo();

    expect(useStudio.getState().repo).toEqual(readOnly);
    expect(useStudio.getState().repoError).toBeNull();
    expect(useStudio.getState().items.length).toBeGreaterThan(0);
  });

  test("lists the directory seedr.config.json names, not `registry/`", async () => {
    // The fork this is named after keeps its own items in `registry-internal/`
    // and carries upstream's `registry/` untouched so merges stay clean. Reading
    // `registry/` regardless showed it all 111 of upstream's items in place of
    // its own — the open checkout's own catalogue was nowhere on screen.
    const fork = { root: "/internal/seedr-internal", name: "seedr-internal", isDefault: false, hasOps: false, registryDir: "registry-internal" };
    onCommand("pick_repo", () => fork);
    mockFs({
      ...registryFiles(),
      "registry-internal": null,
      "registry-internal/skills": null,
      "registry-internal/skills/estate-only": null,
      "registry-internal/skills/estate-only/item.json": JSON.stringify({
        slug: "estate-only", name: "Estate Only", type: "skill", description: "The fork's own item.", compatibility: ["claude"], sourceType: "seedr",
      }),
    });

    await useStudio.getState().chooseRepo();

    expect(useStudio.getState().items.map((item) => item.slug)).toEqual(["estate-only"]);
    expect(useStudio.getState().items[0]?.dir).toBe("registry-internal/skills/estate-only");
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

describe("checkUpstream", () => {
  const answered = (request: RunRequest, items: unknown[]) => ({ taskId: request.taskId, status: "ok", exitCode: 0, stdout: JSON.stringify({ checkedAt: "2026-09-02T12:02:00Z", items }), stderr: "", durationMs: 1 });

  beforeEach(() => {
    useStudio.setState({ repo, upstreamStates: {}, upstreamCheckError: null, upstreamCheckedAt: 0, upstreamChecking: false });
  });

  test("runs upstream-status with the operation timeout and keys every answer by type/slug", async () => {
    const requests: RunRequest[] = [];
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      requests.push(request);
      return answered(request, [
        { type: "skill", slug: "pdf", state: "behind", upstreamUpdatedAt: "2026-09-01T08:00:00Z" },
        { type: "plugin", slug: "superpowers", state: "current" },
      ]);
    });

    await useStudio.getState().checkUpstream();

    // GitHub is on the other end of this one, so it is not held to the local reads' minute.
    expect(requests).toHaveLength(1);
    expect(requests[0]?.args).toContain("upstream-status");
    expect(requests[0]?.timeoutMs).toBe(REGISTRY_OP_TIMEOUT_MS);
    const state = useStudio.getState();
    expect(state.upstreamStates["skill/pdf"]?.state).toBe("behind");
    expect(state.upstreamStates["plugin/superpowers"]?.state).toBe("current");
    expect(state.upstreamCheckError).toBeNull();
    expect(state.upstreamChecking).toBe(false);
    expect(state.upstreamCheckedAt).toBeGreaterThan(0);
  });

  test("a failure clears the previous answers and keeps the reason", async () => {
    useStudio.setState({ upstreamStates: { "skill/pdf": { type: "skill", slug: "pdf", state: "behind" } } });
    onCommand("run_process", (args) => {
      const request = (args as { request: RunRequest }).request;
      return { taskId: request.taskId, status: "failed", exitCode: 1, stdout: "", stderr: "registry-op: unknown command upstream-status", durationMs: 1 };
    });

    await useStudio.getState().checkUpstream();

    const state = useStudio.getState();
    // Stale marks would be worse than none: they would look like this check's answer.
    expect(state.upstreamStates).toEqual({});
    expect(state.upstreamCheckError).toMatch(/unknown command upstream-status/);
    expect(state.upstreamChecking).toBe(false);
    expect(state.upstreamCheckedAt).toBeGreaterThan(0);
  });

  test("runs once at a time, and not at all without a checkout", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    onCommand("run_process", async (args) => {
      calls += 1;
      await gate;
      return answered((args as { request: RunRequest }).request, []);
    });

    useStudio.setState({ repo: null });
    await useStudio.getState().checkUpstream();
    expect(calls).toBe(0);

    useStudio.setState({ repo });
    const first = useStudio.getState().checkUpstream();
    const second = useStudio.getState().checkUpstream();
    expect(useStudio.getState().upstreamChecking).toBe(true);
    release();
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(useStudio.getState().upstreamChecking).toBe(false);
  });
});

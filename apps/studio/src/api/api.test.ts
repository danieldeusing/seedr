import { describe, expect, test } from "vitest";
import { fs, openPath } from "./fs";
import { getRepo, pickRepo, setRepoRoot } from "./repo";
import { onRegistryChanged, REGISTRY_CHANGED, watchRegistry } from "./watch";
import { emit, invoke, listen, onCommand } from "@/test/mockIpc";

/** The wire shape of every IPC call, pinned: a renamed argument here breaks the host. */
describe("IPC serialisation", () => {
  test("filesystem commands send repo-relative paths as `rel`", async () => {
    onCommand("list_dir", () => []);
    onCommand("read_text", () => "text");
    onCommand("path_exists", () => true);
    onCommand("open_path", () => undefined);

    await fs.listDir("registry/skills");
    await fs.readText("registry/skills/pdf/item.json");
    await fs.pathExists("registry");
    await openPath("registry/skills/pdf/SKILL.md");

    expect(invoke.mock.calls).toEqual([
      ["list_dir", { rel: "registry/skills" }],
      ["read_text", { rel: "registry/skills/pdf/item.json" }],
      ["path_exists", { rel: "registry" }],
      ["open_path", { rel: "registry/skills/pdf/SKILL.md" }],
    ]);
  });

  test("repo commands", async () => {
    onCommand("pick_repo", () => ({ root: "/r", name: "r" }));
    onCommand("set_repo_root", (args) => ({ root: String(args?.path), name: "r" }));
    onCommand("get_repo", () => null);

    expect(await pickRepo()).toEqual({ root: "/r", name: "r" });
    expect(await setRepoRoot("/x")).toEqual({ root: "/x", name: "r" });
    expect(await getRepo()).toBeNull();
    expect(invoke).toHaveBeenCalledWith("set_repo_root", { path: "/x" });
  });

  test("an unknown command rejects instead of resolving undefined", async () => {
    await expect(fs.readText("anything")).rejects.toThrow(/Unknown IPC command: read_text/);
  });
});

describe("watch", () => {
  test("asks the host to watch, then coalesces a burst of change events into one callback", async () => {
    onCommand("watch_registry", () => undefined);
    await watchRegistry();
    expect(invoke).toHaveBeenCalledWith("watch_registry");

    let calls = 0;
    const unlisten = await onRegistryChanged(() => calls++, 20);
    expect(listen).toHaveBeenCalledWith(REGISTRY_CHANGED, expect.any(Function));
    emit(REGISTRY_CHANGED);
    emit(REGISTRY_CHANGED);
    emit(REGISTRY_CHANGED);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);

    unlisten();
    emit(REGISTRY_CHANGED);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(1);
  });
});

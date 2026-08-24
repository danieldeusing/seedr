import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fs } from "@/api/fs";
import type { TestInstallOutcome, TestInstallRequest } from "@/api/testInstall";
import { mockFs, onCommand } from "@/test/mockIpc";
import { registryFiles } from "@/test/fixtures";
import { Detail } from "@/features/explorer/Detail";
import { loadRegistry, type StudioItem } from "@/features/explorer/registry";
import { TestPanel } from "./TestPanel";
import { judge, testRefusal, useTest } from "./testStore";

const SKILL_MD = "---\nname: notes\n---\n# notes\n";
const SCRIPT = "print('hi')\n";

function skillRepo(): Record<string, string | null> {
  return {
    ...registryFiles(),
    "registry/skills/notes": null,
    "registry/skills/notes/item.json": JSON.stringify({ slug: "notes", name: "Notes", type: "skill", description: "Takes notes.", compatibility: ["claude", "antigravity"], sourceType: "toolr" }),
    "registry/skills/notes/SKILL.md": SKILL_MD,
    "registry/skills/notes/scripts": null,
    "registry/skills/notes/scripts/run.py": SCRIPT,
  };
}

async function item(slug: string): Promise<StudioItem> {
  mockFs(skillRepo());
  const { items } = await loadRegistry(fs);
  return items.find((i) => i.slug === slug)!;
}

const installed = (files: Record<string, string>, overrides: Partial<TestInstallOutcome> = {}): TestInstallOutcome => ({
  command: ["node", "/repo/node_modules/tsx/dist/cli.mjs", "/repo/packages/cli/src/cli.ts", "add", "notes"],
  scratchDir: "/tmp/seedr-studio-test-1-0",
  run: { taskId: "test-skill-notes", status: "ok", exitCode: 0, stdout: "Installed for 2 agent(s)\n", stderr: "", durationMs: 220 },
  files: { files, skipped: [] },
  cleanupError: null,
  ...overrides,
});

const bothRoots = { ".claude/skills/notes/SKILL.md": SKILL_MD, ".claude/skills/notes/scripts/run.py": SCRIPT, ".agents/skills/notes/SKILL.md": SKILL_MD, ".agents/skills/notes/scripts/run.py": SCRIPT };

beforeEach(() => {
  useTest.getState().reset();
});

describe("judge", () => {
  const sources = { "SKILL.md": SKILL_MD, "scripts/run.py": SCRIPT };

  test("a skill passes when every file is under skills/<slug>/ of some root with identical text", async () => {
    const notes = await item("notes");
    expect(judge(notes, installed(bothRoots), sources)).toEqual({ ok: true, roots: [".agents", ".claude"], problems: [] });
  });

  test("names the file that is missing or differs", async () => {
    const notes = await item("notes");
    const missing = judge(notes, installed({ ".claude/skills/notes/SKILL.md": SKILL_MD }), sources);
    expect(missing.problems).toEqual(["scripts/run.py was not installed"]);
    const differs = judge(notes, installed({ ".claude/skills/notes/SKILL.md": "# other\n", ".claude/skills/notes/scripts/run.py": SCRIPT }), sources);
    expect(differs.problems).toEqual(["SKILL.md was installed with different content"]);
  });

  test("a binary source only has to be present", async () => {
    const notes = await item("notes");
    const outcome = installed({ ".claude/skills/notes/SKILL.md": SKILL_MD }, { files: { files: { ".claude/skills/notes/SKILL.md": SKILL_MD }, skipped: [".claude/skills/notes/logo.png"] } });
    expect(judge(notes, outcome, { "SKILL.md": SKILL_MD, "logo.png": null }).ok).toBe(true);
  });

  test("a failed CLI, an empty scratch dir and a leftover scratch dir are all problems", async () => {
    const notes = await item("notes");
    const failed = installed({}, { run: { taskId: "t", status: "failed", exitCode: 1, stdout: "", stderr: "boom", durationMs: 5 }, cleanupError: "/tmp/x: busy" });
    expect(judge(notes, failed, {}).problems).toEqual(["the CLI failed with exit code 1", "nothing was written", "scratch directory not removed: /tmp/x: busy"]);
    const timedOut = installed({}, { run: { taskId: "t", status: "timeout", exitCode: null, stdout: "", stderr: "", durationMs: 5 } });
    expect(judge(notes, timedOut, {}).problems[0]).toBe("the CLI timeout");
  });

  test("a non-skill only needs exit 0 and something written", async () => {
    const playwright = await item("playwright");
    expect(judge(playwright, installed({ ".mcp.json": "{}" }), {}).ok).toBe(true);
  });
});

describe("testStore", () => {
  test("refuses synced items without running anything", async () => {
    const pdf = await item("pdf");
    expect(testRefusal(pdf)).toMatch(/official items install from their upstream repository/);
    await useTest.getState().run(pdf);
    expect(useTest.getState().error).toMatch(/official items install/);
    expect(useTest.getState().phase).toBe("idle");
  });

  test("asks the host to install the item and compares what came back with the item's files", async () => {
    const notes = await item("notes");
    const requests: TestInstallRequest[] = [];
    onCommand("test_install", (args) => {
      requests.push(args?.request as TestInstallRequest);
      return installed(bothRoots);
    });

    await useTest.getState().run(notes);

    expect(requests).toEqual([{ taskId: "test-skill-notes", type: "skill", slug: "notes", timeoutMs: 120_000 }]);
    expect(useTest.getState().phase).toBe("done");
    expect(useTest.getState().verdict).toEqual({ ok: true, roots: [".agents", ".claude"], problems: [] });
  });

  test("a host refusal is shown and the phase returns to idle", async () => {
    const notes = await item("notes");
    onCommand("test_install", () => {
      throw new Error("node_modules/tsx/dist/cli.mjs: not found — run `pnpm install` in the checkout first");
    });
    await useTest.getState().run(notes);
    expect(useTest.getState().phase).toBe("idle");
    expect(useTest.getState().error).toMatch(/run `pnpm install`/);
  });
});

describe("TestPanel", () => {
  test("runs on mount, lists the written files with the verdict, and goes back", async () => {
    const notes = await item("notes");
    onCommand("test_install", () => installed({ ".claude/skills/notes/SKILL.md": SKILL_MD, ".claude/skills/notes/scripts/run.py": "print('changed')\n" }));
    render(<TestPanel item={notes} />);

    expect(await screen.findByTestId("test-verdict")).toHaveTextContent("failed: scripts/run.py was installed with different content");
    expect(screen.getByRole("status")).toHaveTextContent("ok in 220 ms");
    expect(screen.getByRole("list", { name: "written files" })).toHaveTextContent(".claude/skills/notes/SKILL.md");
    expect(screen.getByTestId("test-output")).toHaveTextContent("Installed for 2 agent(s)");

    // closing is the dialog frame's job now; the panel keeps only "run again"
    expect(screen.getByRole("button", { name: "run again" })).toBeInTheDocument();
  });
});

describe("Detail", () => {
  test("offers the test only for first-party items", async () => {
    const notes = await item("notes");
    const onTest = vi.fn();
    const { unmount } = render(<Detail item={notes} onTest={onTest} />);
    await userEvent.click(await screen.findByRole("button", { name: /^test install/ }));
    expect(onTest).toHaveBeenCalled();
    unmount();

    const pdf = await item("pdf");
    render(<Detail item={pdf} onTest={onTest} />);
    expect(screen.queryByRole("button", { name: /^test install/ })).toBeNull();
  });
});

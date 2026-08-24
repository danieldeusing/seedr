import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegistryItem } from "@seedr/shared";

const CANCEL = Symbol("cancel");
vi.mock("@clack/prompts", () => ({
  log: { step: vi.fn(), info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn(), message: vi.fn() },
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: (value: unknown) => value === CANCEL,
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
}));

const ITEM: RegistryItem = { slug: "pdf", name: "PDF", type: "skill", description: "Read PDFs", compatibility: ["claude"] };

describe("clack ui", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("selectSkill, selectScope and selectMethod delegate to select", async () => {
    const ui = await import("./ui.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select).mockResolvedValueOnce(ITEM).mockResolvedValueOnce("local").mockResolvedValueOnce("symlink");

    expect(await ui.selectSkill([ITEM])).toBe(ITEM);
    expect(await ui.selectScope(true)).toBe("local");
    expect(vi.mocked(prompts.select).mock.calls[1]![0].options.map((o: { value: unknown }) => o.value)).toEqual(["project", "user", "local"]);
    expect(await ui.selectMethod("/central")).toBe("symlink");

    vi.mocked(prompts.select).mockResolvedValueOnce("project");
    await ui.selectScope();
    expect(vi.mocked(prompts.select).mock.calls[3]![0].options).toHaveLength(2);
  });

  it("selectAgents returns all, a subset, or the cancel symbol", async () => {
    const ui = await import("./ui.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.select).mockResolvedValueOnce("all");
    expect(await ui.selectAgents(["claude", "codex"])).toEqual(["claude", "codex"]);

    vi.mocked(prompts.select).mockResolvedValueOnce("select");
    vi.mocked(prompts.multiselect).mockResolvedValueOnce(["codex"]);
    expect(await ui.selectAgents(["claude", "codex"])).toEqual(["codex"]);

    vi.mocked(prompts.select).mockResolvedValueOnce(CANCEL);
    expect(await ui.selectAgents(["claude"])).toBe(CANCEL);
  });

  it("log helpers forward to clack and printing helpers write to stdout", async () => {
    const ui = await import("./ui.js");
    const prompts = await import("@clack/prompts");
    vi.mocked(prompts.confirm).mockResolvedValueOnce(true);
    expect(await ui.confirm("ok?")).toBe(true);

    ui.intro("Seedr");
    ui.outro("done");
    ui.step("s");
    ui.info("i");
    ui.success("ok");
    ui.warn("w");
    ui.error("e");
    ui.message("m");
    expect(prompts.intro).toHaveBeenCalled();
    expect(prompts.outro).toHaveBeenCalled();
    expect(prompts.log.step).toHaveBeenCalledWith("s");
    expect(prompts.log.info).toHaveBeenCalledWith("i");
    expect(prompts.log.success).toHaveBeenCalledWith("ok");
    expect(prompts.log.warn).toHaveBeenCalledWith("w");
    expect(prompts.log.error).toHaveBeenCalledWith("e");
    expect(prompts.log.message).toHaveBeenCalledWith("m");

    ui.printLogo();
    ui.printHeader("Header");
    expect(vi.mocked(console.log)).toHaveBeenCalled();
  });

  it("cancelled prints and exits with 0", async () => {
    const ui = await import("./ui.js");
    const prompts = await import("@clack/prompts");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    ui.cancelled();
    expect(prompts.cancel).toHaveBeenCalledWith("Operation cancelled");
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });
});

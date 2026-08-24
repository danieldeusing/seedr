import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RegistryItem } from "@seedr/shared";

const promptMock = vi.fn();
vi.mock("inquirer", () => ({
  default: { prompt: (...args: unknown[]) => promptMock(...args) },
}));

const ITEM: RegistryItem = { slug: "pdf", name: "PDF", type: "skill", description: "Read PDFs", compatibility: ["claude"] };

describe("inquirer prompts", () => {
  beforeEach(() => {
    promptMock.mockReset();
  });

  it("promptSkillSelection offers every item", async () => {
    const { promptSkillSelection } = await import("./prompts.js");
    promptMock.mockResolvedValue({ skill: ITEM });

    expect(await promptSkillSelection([ITEM])).toBe(ITEM);
    const question = promptMock.mock.calls[0]![0][0];
    expect(question.choices[0]).toMatchObject({ name: "PDF - Read PDFs", value: ITEM, short: "PDF" });
  });

  it("promptAgentSelection returns all compatible agents or a checked subset", async () => {
    const { promptAgentSelection } = await import("./prompts.js");
    promptMock.mockResolvedValueOnce({ selection: "all" });
    expect(await promptAgentSelection(["claude", "codex"])).toEqual(["claude", "codex"]);

    promptMock.mockResolvedValueOnce({ selection: "select" }).mockResolvedValueOnce({ agents: ["codex"] });
    expect(await promptAgentSelection(["claude", "codex"])).toEqual(["codex"]);
    const checkbox = promptMock.mock.calls[2]![0][0];
    expect(checkbox.choices).toEqual([
      { name: "Claude Code", value: "claude", checked: true },
      { name: "OpenAI Codex CLI", value: "codex", checked: false },
    ]);
    expect(checkbox.validate([])).toBe("Please select at least one agent");
    expect(checkbox.validate(["claude"])).toBe(true);
  });

  it("promptScope, promptMethod, promptConfirm and promptSearch pass answers through", async () => {
    const { promptScope, promptMethod, promptConfirm, promptSearch } = await import("./prompts.js");
    promptMock.mockResolvedValueOnce({ scope: "user" });
    expect(await promptScope()).toBe("user");
    promptMock.mockResolvedValueOnce({ method: "copy" });
    expect(await promptMethod()).toBe("copy");
    promptMock.mockResolvedValueOnce({ confirmed: false });
    expect(await promptConfirm("Sure?", false)).toBe(false);
    expect(promptMock.mock.calls[2]![0][0]).toMatchObject({ message: "Sure?", default: false });
    promptMock.mockResolvedValueOnce({ query: "  pdf " });
    expect(await promptSearch()).toBe("pdf");
  });
});

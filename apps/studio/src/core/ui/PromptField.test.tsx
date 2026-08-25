import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { onCommand } from "@/test/mockIpc";
import { matchSkills, PromptField, slashToken } from "./PromptField";

const SKILLS = [
  { name: "add-community", description: "Add a GitHub repo", scope: "project" as const },
  { name: "skill-creator", description: "Write a new skill", scope: "user" as const },
  { name: "skill-optimizer", description: "Tighten a skill", scope: "user" as const },
];

function Harness({ initial = "" }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <PromptField id="p" value={value} onChange={setValue} />;
}

describe("slashToken", () => {
  test("opens on a token that starts a line or follows a space, never inside a path", () => {
    expect(slashToken("/add", 4)).toEqual({ query: "add", start: 0 });
    expect(slashToken("use /skill", 10)).toEqual({ query: "skill", start: 4 });
    expect(slashToken("a\n/skill", 8)).toEqual({ query: "skill", start: 2 });
    expect(slashToken("/", 1)).toEqual({ query: "", start: 0 });
    expect(slashToken("registry/skills", 15)).toBeNull();
    expect(slashToken("/one two", 8)).toBeNull();
    expect(slashToken("nothing here", 12)).toBeNull();
  });

  test("reads the token the caret is in, not the last one typed", () => {
    expect(slashToken("/add-seedr and /skill", 10)).toEqual({ query: "add-seedr", start: 0 });
  });
});

describe("matchSkills", () => {
  test("matches anywhere in the name and caps the list", () => {
    expect(matchSkills(SKILLS, "skill").map((skill) => skill.name)).toEqual(["skill-creator", "skill-optimizer"]);
    expect(matchSkills(SKILLS, "COMMUNITY").map((skill) => skill.name)).toEqual(["add-community"]);
    expect(matchSkills(SKILLS, "")).toHaveLength(3);
    expect(matchSkills(Array.from({ length: 30 }, (_, i) => ({ name: `s${i}`, description: "", scope: "user" as const })), "s")).toHaveLength(8);
  });
});

describe("PromptField", () => {
  test("offers the machine's skills on a slash and inserts the chosen one", async () => {
    onCommand("list_skills", () => SKILLS);
    render(<Harness />);

    await userEvent.type(screen.getByRole("textbox"), "please /skill");

    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["/skill-creatorWrite a new skilluser", "/skill-optimizerTighten a skilluser"]);

    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByRole("textbox")).toHaveValue("please /skill-optimizer ");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  test("Escape dismisses the list and leaves the text alone", async () => {
    onCommand("list_skills", () => SKILLS);
    render(<Harness />);

    await userEvent.type(screen.getByRole("textbox"), "/add");
    expect(await screen.findByRole("option", { name: /add-community/ })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("/add");
  });

  test("a host that cannot list skills leaves a plain textarea", async () => {
    onCommand("list_skills", () => {
      throw new Error("Unknown IPC command: list_skills");
    });
    render(<Harness />);

    await userEvent.type(screen.getByRole("textbox"), "/add");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("/add");
  });
});

import { describe, expect, it } from "vitest";
import type { CollectedContent } from "./content.js";
import { countWords, draftLongDescription, readmeLead } from "./tldr.js";

function content(files: Record<string, string>): CollectedContent {
  return {
    files: [],
    entries: Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text, "utf-8"), blobSha: "0".repeat(40) })),
    contentDigest: null,
    contentHash: null,
    license: { note: "none" },
    skipped: [],
  };
}

const base = { name: "acme", marketplace: "claude-community", repo: "acme/plugin", path: "" };

describe("draftLongDescription", () => {
  it("lists a package's components with their own frontmatter descriptions, as bullets", () => {
    const draft = draftLongDescription({
      ...base,
      path: "plugins/acme",
      components: { skills: ["tdd", "review"], agents: ["planner"], hooks: ["PreToolUse"], mcpServers: ["acme"] },
      content: content({
        "skills/tdd/SKILL.md": "---\nname: tdd\ndescription: Write the failing test first. Then make it pass with the smallest change.\n---\n",
        "skills/review/SKILL.md": "---\nname: review\ndescription: >\n  Review a pull request\n  for regressions\n---\n",
        "agents/planner.md": "---\ndescription: Plans multi-step work\n---\n",
      }),
    });
    expect(draft).toBe(
      [
        "Ships **2 skills**, **1 agent**, **1 hook** and **1 MCP server**.",
        "- **Skills** (2): `tdd` (Write the failing test first), `review` (Review a pull request for regressions)\n- **Agents** (1): `planner` (Plans multi-step work)\n- **Hooks** (1): `PreToolUse`\n- **MCP servers** (1): `acme`",
        "Installs with `claude plugin install acme@claude-community` from `acme/plugin` (`plugins/acme`).",
      ].join("\n\n"),
    );
    expect(countWords(draft)).toBeGreaterThanOrEqual(30);
  });

  it("names at most eight components of a kind and counts the rest", () => {
    const skills = Array.from({ length: 11 }, (_, index) => `skill-${index}`);
    const summary = "Eleven skills that cover the whole release flow, from the first failing test to the changelog entry.";
    const draft = draftLongDescription({ ...base, summary, components: { skills }, content: content({}) });
    expect(draft).toContain("`skill-7`, and 3 more");
    expect(draft).not.toContain("`skill-8`");
  });

  it("shortens a long component description to its first sentence and eighteen words", () => {
    const words = Array.from({ length: 30 }, (_, index) => `w${index}`).join(" ");
    const draft = draftLongDescription({
      ...base,
      components: { skills: ["long", "second", "third"] },
      content: content({ "skills/long/SKILL.md": `---\ndescription: ${words}. Never shown.\n---\n` }),
    });
    expect(draft).toContain(`\`long\` (${Array.from({ length: 18 }, (_, index) => `w${index}`).join(" ")}…)`);
    expect(draft).not.toContain("Never shown");
  });

  it("writes one or two components as prose and pads a short draft with the README's opening paragraph", () => {
    const draft = draftLongDescription({
      ...base,
      summary: "Summary from the marketplace entry.",
      components: { skills: ["eli5"] },
      content: content({
        "skills/eli5/SKILL.md": "---\nname: eli5\ndescription: Explain any topic like I'm 5\n---\n",
        "README.md": [
          "# ELI5",
          "",
          "[![build](https://img.shields.io/x)](https://ci)",
          "<p align=\"center\"><img src=\"logo.png\"></p>",
          "",
          "Turns **any topic** into a one-page picture explainer with big visuals and",
          "few words, built for [Claude Code](https://claude.com) and rendered as HTML.",
          "",
          "## Install",
          "",
          "Run `claude plugin install eli5`.",
        ].join("\n"),
      }),
    });
    expect(draft).toBe(
      [
        "Ships **1 skill**, `eli5` (Explain any topic like I'm 5).",
        "Installs with `claude plugin install acme@claude-community` from `acme/plugin`.",
        "Turns any topic into a one-page picture explainer with big visuals and few words, built for Claude Code and rendered as HTML.",
      ].join("\n\n"),
    );
    expect(draft).not.toContain("Summary from the marketplace entry");
  });

  it("falls back to the entry's summary when there is no README, and gives up when even that is too little", () => {
    const summary = "Guides developers through swapping tokens with the API, covering quotes, approvals, signing and submission across twenty chains, with code samples for each step.";
    const draft = draftLongDescription({ ...base, summary, components: { mcpServers: ["acme"] }, content: content({}) });
    expect(draft).toBe(["Ships **1 MCP server**, `acme`.", "Installs with `claude plugin install acme@claude-community` from `acme/plugin`.", summary].join("\n\n"));

    expect(draftLongDescription({ ...base, summary: "Too short.", components: {}, content: content({}) })).toBeNull();
  });

  it("caps the README lead at sixty words and skips fenced code", () => {
    const long = Array.from({ length: 70 }, (_, index) => `w${index}`).join(" ");
    const lead = readmeLead(content({ "README.md": `# T\n\n\`\`\`sh\nnpm i\n\`\`\`\n\n${long}\n` }));
    expect(lead).toBe(`${Array.from({ length: 60 }, (_, index) => `w${index}`).join(" ")}…`);
    expect(readmeLead(content({ "README.md": "# Only a title\n\n- a list\n" }))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { tokenize } from "./highlight";

const joined = (text: string, language: string) => tokenize(text, language).map((line) => line.map((t) => t.text).join(""));

describe("tokenize", () => {
  it("round-trips every character of the input", () => {
    const samples: [string, string][] = [
      ['const x = "a\\"b"; // c\n/* d\ne */ let y = 1.5;', "typescript"],
      ["# title\n\n- `code` item\n```js\nlet a = 1\n```\n> quote", "markdown"],
      ["key: value # note\nflag: true", "yaml"],
      ["SELECT 1 -- x\n/* multi\nline */", "sql"],
      ["anything at all\n\twith tabs", "plaintext"],
      ["", "javascript"],
    ];
    for (const [text, language] of samples) {
      expect(joined(text, language)).toEqual(text.split("\n"));
    }
  });

  it("classifies comments, strings, numbers and keywords", () => {
    const line = tokenize('return "x" + 42; // done', "javascript")[0];
    expect(line).toEqual([
      { text: "return", type: "keyword" },
      { text: " " },
      { text: '"x"', type: "string" },
      { text: " + " },
      { text: "42", type: "number" },
      { text: "; " },
      { text: "// done", type: "comment" },
    ]);
  });

  it("carries block comments across lines", () => {
    const lines = tokenize("a /* start\nstill\nend */ b", "typescript");
    expect(lines[0]).toEqual([{ text: "a " }, { text: "/* start", type: "comment" }]);
    expect(lines[1]).toEqual([{ text: "still", type: "comment" }]);
    expect(lines[2]).toEqual([{ text: "end */", type: "comment" }, { text: " b" }]);
  });

  it("does not treat // inside a string as a comment", () => {
    const line = tokenize('const u = "https://x";', "javascript")[0]!;
    expect(line.find((t) => t.type === "comment")).toBeUndefined();
    expect(line.find((t) => t.type === "string")?.text).toBe('"https://x"');
  });

  it("does not match keywords inside identifiers", () => {
    const line = tokenize("const returnValue = format(thisIsFine);", "javascript")[0]!;
    expect(line.filter((t) => t.type === "keyword").map((t) => t.text)).toEqual(["const"]);
  });

  it("marks markdown headings, fences, quotes, bullets and inline code", () => {
    const lines = tokenize("# Heading\n```\nnot # a heading\n```\n> quote\n- item with `code`", "markdown");
    expect(lines[0]).toEqual([{ text: "# Heading", type: "heading" }]);
    expect(lines[1]).toEqual([{ text: "```", type: "punct" }]);
    expect(lines[2]).toEqual([{ text: "not # a heading" }]);
    expect(lines[4]).toEqual([{ text: "> quote", type: "comment" }]);
    expect(lines[5]).toEqual([{ text: "- ", type: "punct" }, { text: "item with " }, { text: "`code`", type: "string" }]);
  });

  it("leaves unknown languages untyped", () => {
    expect(tokenize("x = 1", "brainfuck")).toEqual([[{ text: "x = 1" }]]);
  });

  it("uses # comments for shell and yaml, -- for sql", () => {
    expect(tokenize("echo hi # c", "shell")[0]?.at(-1)).toEqual({ text: "# c", type: "comment" });
    expect(tokenize("SELECT -- c", "sql")[0]?.at(-1)).toEqual({ text: "-- c", type: "comment" });
  });
});

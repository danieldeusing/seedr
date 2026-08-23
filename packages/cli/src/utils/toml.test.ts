import { describe, it, expect } from "vitest";
import {
  parseTomlHeader,
  parseTomlSections,
  upsertTomlTables,
  removeTomlTables,
  hasTomlTable,
  listTomlChildTables,
  formatTomlValue,
  formatTomlKey,
  formatTomlString,
} from "./toml.js";

const PROJECTS_HEADER = "[[projects]]";

const MCP = "mcp_servers";
const CONTROL_CHAR = String.fromCharCode(1);
const DELETE_CHAR = String.fromCharCode(0x7f);

const EXISTING = `# Codex configuration
model = "o3"
approval_policy = "never"

[profiles.fast]
model = "o4-mini"

[mcp_servers.other]
command = "other-server"
args = ["--flag"]

[mcp_servers.other.env]
TOKEN = "abc"

[[projects]]
path = "/a"
`;

describe("parseTomlHeader", () => {
  it.each([
    ["[a]", ["a"]],
    ["[a.b.c]", ["a", "b", "c"]],
    ['[mcp_servers."my server"]', ["mcp_servers", "my server"]],
    ["[ a . b ]", ["a", "b"]],
    ["[a.b] # trailing comment", ["a", "b"]],
    [PROJECTS_HEADER, ["projects"]],
    ["['lit.eral'.x]", ["lit.eral", "x"]],
    ['["esc\\"aped"]', ['esc"aped']],
    ['["a.b".c]', ["a.b", "c"]],
  ])("parses %s", (line, expected) => {
    expect(parseTomlHeader(line)).toEqual(expected);
  });

  it.each(['key = "value"', "", "# [not a header]", "[unterminated", "[a..b]", '["unclosed]', "[.a]", "[]"])(
    "returns null for %j",
    (line) => {
      expect(parseTomlHeader(line)).toBeNull();
    }
  );
});

describe("upsertTomlTables", () => {
  it("inserts a new server table after unrelated content, preserving it verbatim", () => {
    const result = upsertTomlTables(EXISTING, [MCP, "github"], [
      { keyPath: [MCP, "github"], entries: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] } },
      { keyPath: [MCP, "github", "env"], entries: { GITHUB_TOKEN: "${GITHUB_TOKEN}" } },
    ]);
    expect(result).toContain('model = "o3"');
    expect(result).toContain("[profiles.fast]");
    expect(result).toContain("[mcp_servers.other]");
    expect(result).toContain("[mcp_servers.other.env]");
    expect(result).toContain(PROJECTS_HEADER);
    expect(result).toContain(
      '[mcp_servers.github]\ncommand = "npx"\nargs = ["-y", "@modelcontextprotocol/server-github"]\n\n[mcp_servers.github.env]\nGITHUB_TOKEN = "${GITHUB_TOKEN}"\n'
    );
    expect(result.endsWith("\n")).toBe(true);
  });

  it("replaces only the targeted server and its sub-tables", () => {
    const result = upsertTomlTables(EXISTING, [MCP, "other"], [
      { keyPath: [MCP, "other"], entries: { command: "new-cmd" } },
    ]);
    expect(result).not.toContain('command = "other-server"');
    expect(result).not.toContain("[mcp_servers.other.env]");
    expect(result).not.toContain('TOKEN = "abc"');
    expect(result).toContain('[mcp_servers.other]\ncommand = "new-cmd"');
    expect(result).toContain('model = "o3"');
    expect(result).toContain(PROJECTS_HEADER);
  });

  it("round-trips: upsert then remove leaves the unrelated document intact", () => {
    const inserted = upsertTomlTables(EXISTING, [MCP, "github"], [
      { keyPath: [MCP, "github"], entries: { command: "npx" } },
    ]);
    const { text, removed } = removeTomlTables(inserted, [MCP, "github"]);
    expect(removed).toBe(true);
    expect(parseTomlSections(text).map((s) => s.keyPath)).toEqual(parseTomlSections(EXISTING).map((s) => s.keyPath));
    expect(text).toContain('approval_policy = "never"');
    expect(text).toContain('TOKEN = "abc"');
  });

  it("works on an empty document", () => {
    expect(upsertTomlTables("", [MCP, "x"], [{ keyPath: [MCP, "x"], entries: { command: "c" } }])).toBe(
      '[mcp_servers.x]\ncommand = "c"\n'
    );
  });

  it("quotes keys that are not bare and escapes strings", () => {
    const result = upsertTomlTables("", [MCP, "my server"], [
      { keyPath: [MCP, "my server"], entries: { command: 'say "hi"\\' } },
      { keyPath: [MCP, "my server", "env"], entries: { "WEIRD KEY": `a\nb\tc${CONTROL_CHAR}` } },
    ]);
    expect(result).toContain('[mcp_servers."my server"]');
    expect(result).toContain('command = "say \\"hi\\"\\\\"');
    expect(result).toContain('"WEIRD KEY" = "a\\nb\\tc\\u0001"');
    expect(hasTomlTable(result, [MCP, "my server"])).toBe(true);
    expect(listTomlChildTables(result, [MCP])).toEqual(["my server"]);
  });

  it("does not touch a server whose name merely shares a prefix", () => {
    const doc = "[mcp_servers.github]\ncommand = \"a\"\n\n[mcp_servers.github-enterprise]\ncommand = \"b\"\n";
    const { text } = removeTomlTables(doc, [MCP, "github"]);
    expect(text).toContain("[mcp_servers.github-enterprise]");
    expect(text).not.toContain('command = "a"');
  });
});

describe("removeTomlTables / hasTomlTable / listTomlChildTables", () => {
  it("reports when nothing was removed", () => {
    const { text, removed } = removeTomlTables(EXISTING, [MCP, "missing"]);
    expect(removed).toBe(false);
    expect(text).toBe(EXISTING);
  });

  it("lists direct children only", () => {
    expect(listTomlChildTables(EXISTING, [MCP])).toEqual(["other"]);
    expect(listTomlChildTables(EXISTING, ["profiles"])).toEqual(["fast"]);
    expect(listTomlChildTables(EXISTING, ["nothing"])).toEqual([]);
  });

  it("hasTomlTable requires an exact key path", () => {
    expect(hasTomlTable(EXISTING, [MCP, "other"])).toBe(true);
    expect(hasTomlTable(EXISTING, [MCP])).toBe(false);
    expect(hasTomlTable(EXISTING, [MCP, "other", "env"])).toBe(true);
  });

  it("handles CRLF input", () => {
    const crlf = "a = 1\r\n[mcp_servers.x]\r\ncommand = \"c\"\r\n";
    expect(hasTomlTable(crlf, [MCP, "x"])).toBe(true);
    expect(removeTomlTables(crlf, [MCP, "x"]).text).toBe("a = 1\n");
  });
});

describe("value formatting", () => {
  it("formats scalars and arrays", () => {
    expect(formatTomlValue("x")).toBe('"x"');
    expect(formatTomlValue(3)).toBe("3");
    expect(formatTomlValue(true)).toBe("true");
    expect(formatTomlValue(false)).toBe("false");
    expect(formatTomlValue(["a", "b"])).toBe('["a", "b"]');
    expect(() => formatTomlValue(Number.POSITIVE_INFINITY)).toThrow(/Cannot encode/);
  });

  it("formats keys and strings", () => {
    expect(formatTomlKey("plain-key_1")).toBe("plain-key_1");
    expect(formatTomlKey("has space")).toBe('"has space"');
    expect(formatTomlString("\r")).toBe('"\\r"');
    expect(formatTomlString(DELETE_CHAR)).toBe('"\\u007f"');
  });
});

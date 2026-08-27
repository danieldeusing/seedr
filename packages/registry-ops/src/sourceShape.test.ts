import { describe, expect, test } from "vitest";
import { isOneCapability, looksLikeType } from "./sourceShape.js";

describe("what a folder of content looks like", () => {
  test("a marker in the files beats whatever the path says", () => {
    // A skill living inside a plugin's own tree is still a skill.
    expect(looksLikeType(["SKILL.md"], "/x/plugins/superpowers/skills/pdf")).toBe("skill");
    expect(looksLikeType([".claude-plugin/plugin.json"], "/x/anywhere")).toBe("plugin");
  });

  test("falls back to the deepest path segment when nothing is marked", () => {
    expect(looksLikeType(["a.md", "b.md"], "/Users/me/.claude/skills")).toBe("skill");
    expect(looksLikeType(["one.sh"], "/repo/.claude/hooks")).toBe("hook");
    expect(looksLikeType(["x.md"], "/repo/plugins/p/commands")).toBe("command");
  });

  test("says nothing when nothing says", () => {
    expect(looksLikeType(["notes.md"], "/Users/me/Documents")).toBeNull();
  });

  test("a plugin is marked by its plugin.json, never by a plugin.md", () => {
    expect(isOneCapability([".claude-plugin/plugin.json"], "plugin")).toBe(true);
    expect(isOneCapability(["plugin.md"], "plugin")).toBe(false);
  });

  test("a folder of several skills is not one skill", () => {
    expect(isOneCapability(["a.md", "b.md"], "skill")).toBe(false);
    expect(isOneCapability(["SKILL.md", "references/x.md"], "skill")).toBe(true);
  });
});

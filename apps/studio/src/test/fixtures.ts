import type { RegistryItem } from "@seedr/shared";

const LONG = "Reads `item.json` files and " + "checks every description carefully ".repeat(10);

export const pdf: RegistryItem = {
  slug: "pdf",
  name: "PDF",
  type: "skill",
  description: "Works with PDF files.",
  longDescription: LONG,
  compatibility: ["claude"],
  sourceType: "official",
  author: { name: "Anthropic" },
  externalUrl: "https://github.com/anthropics/skills/tree/main/skills/pdf",
};

export const playwright: RegistryItem = {
  slug: "playwright",
  name: "Playwright",
  type: "mcp",
  description: "Drives a browser.",
  longDescription: LONG,
  compatibility: ["claude"],
  sourceType: "toolr",
  author: { name: "Test Author" },
};

/** A small repo-relative filesystem: two valid items, one invalid, one unparsable. */
export function registryFiles(): Record<string, string | null> {
  return {
    registry: null,
    "registry/skills": null,
    "registry/skills/pdf": null,
    "registry/skills/pdf/item.json": JSON.stringify(pdf),
    "registry/skills/broken": null,
    "registry/skills/broken/item.json": JSON.stringify({ ...pdf, slug: "broken", compatibility: [] }),
    "registry/skills/garbage": null,
    "registry/skills/garbage/item.json": "{ nope",
    "registry/mcp": null,
    "registry/mcp/playwright": null,
    "registry/mcp/playwright/item.json": JSON.stringify(playwright),
    "registry/mcp/playwright/mcp.md": "# config\n",
    "registry/mcp/playwright/docs": null,
    "registry/mcp/playwright/docs/notes.md": "notes\n",
  };
}

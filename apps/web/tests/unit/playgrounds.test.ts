import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const playgroundsDir = join(__dirname, "..", "..", "public", "playgrounds");
const PLAYGROUNDS = ["cli-explorer", "compatibility-matrix", "install-paths", "registry-architecture"];

const PAYLOADS = [
  '<img src=x onerror="window.__pwned = 1">',
  "<script>window.__pwned = 1</script>",
  '"><svg onload="window.__pwned = 1">',
  "pdf' onmouseover='window.__pwned = 1",
  "<iframe srcdoc='<script>parent.__pwned = 1</script>'>",
];

declare global {
  interface Window {
    __pwned?: number;
  }
}

/** jsdom has no constructable stylesheets; the pages use them for per-type colours. */
function polyfillConstructableStylesheets() {
  if (!("adoptedStyleSheets" in document)) {
    Object.defineProperty(document, "adoptedStyleSheets", { value: [], writable: true, configurable: true });
  }
  class StubStyleSheet {
    rules: string[] = [];
    insertRule(rule: string) {
      this.rules.push(rule);
      return this.rules.length - 1;
    }
    replaceSync(text: string) {
      this.rules = [text];
    }
  }
  Object.defineProperty(globalThis, "CSSStyleSheet", { value: StubStyleSheet, writable: true, configurable: true });
}

/** Mounts a playground's markup into jsdom and runs its script once. */
async function mount(name: string) {
  polyfillConstructableStylesheets();
  const html = readFileSync(join(playgroundsDir, `${name}.html`), "utf8");
  const body = /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? "";
  // A fresh <body> per mount. Listeners bound to document.body itself survive
  // an innerHTML swap, so 23 mounts left 23 live click handlers and a later
  // playground's [data-action] fired an earlier playground's handler — the
  // suite only passed in declared order.
  const fresh = document.createElement("body");
  document.body.replaceWith(fresh);
  fresh.innerHTML = body.replace(/<script[^>]*><\/script>/g, "");
  vi.resetModules();
  await import(/* @vite-ignore */ join(playgroundsDir, `${name}.js`));
}

function type(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`missing ${selector}`);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function forbiddenElements() {
  return document.querySelectorAll("img, script, svg, iframe, object, embed").length;
}

describe("playground scripts never build markup from strings", () => {
  it.each(PLAYGROUNDS)("%s.js contains no innerHTML/outerHTML/insertAdjacentHTML/document.write/eval", (name) => {
    const source = readFileSync(join(playgroundsDir, `${name}.js`), "utf8");
    for (const forbidden of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "javascript:"]) {
      expect(source, `${name}.js uses ${forbidden}`).not.toContain(forbidden);
    }
  });

  it.each(PLAYGROUNDS)("%s.html has no inline script, inline handler or inline style", (name) => {
    const html = readFileSync(join(playgroundsDir, `${name}.html`), "utf8");
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/\sstyle\s*=/i);
    expect(html).not.toMatch(/<style\b/i);
    expect(html).not.toContain("cdn.jsdelivr.net");
    expect(html).toContain('href="vendor/tokens.css"');
  });

  it("every playground asset is local (no CDN anywhere under public/playgrounds)", () => {
    for (const file of readdirSync(playgroundsDir)) {
      if (!/\.(html|css|js)$/.test(file)) continue;
      expect(readFileSync(join(playgroundsDir, file), "utf8"), file).not.toMatch(/https?:\/\/cdn\./);
    }
  });
});

describe("CLI explorer treats typed names as text, never as HTML", () => {
  beforeEach(async () => {
    delete window.__pwned;
    await mount("cli-explorer");
  });

  it("renders the default state", () => {
    expect(document.querySelector("#cmdText")?.textContent).toBe("$ npx seedr add pdf --type skill");
    expect(document.querySelector("#termOutput")?.textContent).toContain("Installation complete");
    expect(forbiddenElements()).toBe(0);
  });

  it.each(PAYLOADS)("add: item name %s", (payload) => {
    type("#addName", payload);
    expect(forbiddenElements()).toBe(0);
    expect(window.__pwned).toBeUndefined();
    expect(document.querySelector("#cmdText")?.textContent).toContain(payload);
    expect(document.querySelector("#termOutput")?.textContent).toContain(payload);
    expect(document.querySelector("#fileTree")?.textContent).toContain(payload);
    // the name is also written back into the input as a value, not as markup
    expect(document.querySelector<HTMLInputElement>("#addName")?.value).toBe(payload);
  });

  it.each(PAYLOADS)("remove: item name %s", (payload) => {
    document.querySelector<HTMLButtonElement>('[data-action="select-command"][data-value="remove"]')!.click();
    type("#removeName", payload);
    expect(forbiddenElements()).toBe(0);
    expect(window.__pwned).toBeUndefined();
    expect(document.querySelector("#cmdText")?.textContent).toContain(payload);
    expect(document.querySelector("#termOutput")?.textContent).toContain(payload);
    expect(document.querySelector("#fileTree")?.textContent).toContain(payload);
  });

  it("keeps a typed name through type, scope and preset changes without creating elements", () => {
    type("#addName", PAYLOADS[0]!);
    document.querySelector<HTMLButtonElement>('[data-action="set-add-scope"][data-value="user"]')!.click();
    expect(document.querySelector("#fileTree")?.textContent).toContain(`└── ${PAYLOADS[0]}/`);
    document.querySelector<HTMLButtonElement>('[data-action="toggle-add"][data-key="dryRun"]')!.click();
    expect(document.querySelector<HTMLElement>("#dryRunBanner")?.hidden).toBe(false);
    document.querySelector<HTMLButtonElement>('[data-action="apply-preset"][data-value="2"]')!.click();
    expect(document.querySelector("#cmdText")?.textContent).toBe("$ npx seedr add pre-commit-lint --type hook");
    expect(forbiddenElements()).toBe(0);
    expect(window.__pwned).toBeUndefined();
  });
});

describe("the other playgrounds mount and react to their controls without markup injection", () => {
  it.each(["compatibility-matrix", "install-paths", "registry-architecture"])("%s", async (name) => {
    await mount(name);
    const controls = document.querySelectorAll<HTMLElement>(".view-tab, .type-chip, .tool-chip, .source-chip, .radio-btn, .toggle, .preset-btn, .node, td[data-type]");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of [...controls].slice(0, 25)) control.click();
    expect(document.querySelectorAll("script, iframe, object, embed").length).toBe(0);
    expect(window.__pwned).toBeUndefined();
  });
});

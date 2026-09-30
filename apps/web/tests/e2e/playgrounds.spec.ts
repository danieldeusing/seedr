import type { Page } from "@playwright/test";
import { expect, failOnConsoleErrors, test } from "./helpers";

// Daniel, 2026-09-28: "A dropdown should ALWAYS have the custom layout for the list, not the
// system one." The playgrounds vendor the latest @danieldeusing/design on every build, so this
// is what proves its select runtime still takes over every <select> they render, and names it.
// One case per select: `add` has its select on load, `list` and `remove` render theirs later, and
// choosing a type re-renders the panel that holds it, so each is a node the runtime enhanced after
// the page had loaded.
const SELECTS = [
  { command: "add", id: "addType", initial: "Skill", chosen: "$ npx seedr add project-security-guard --type hook" },
  { command: "list", id: "listType", initial: "All types", chosen: "$ npx seedr list --type hook" },
  { command: "remove", id: "removeType", initial: "Skill", chosen: "$ npx seedr remove pdf --type hook" },
];

/**
 * The trigger's name and value as Chromium hands them to a screen reader. Read from the browser's own
 * accessibility tree: since design 0.61.0 the runtime points the trigger at its <label> by element
 * reference (ariaLabelledByElements), which Playwright's name computation does not read, so to getByRole
 * the trigger has no name at all.
 */
async function announced(page: Page, selector: string): Promise<{ name: string; value: string }> {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector });
    if (!nodeId) return { name: "", value: "" };
    const [node] = (await cdp.send("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false })).nodes;
    // The stylesheet ends the shown value with a zero-width space (.select-value::after), which Chromium keeps.
    return { name: String(node?.name?.value ?? ""), value: String(node?.value?.value ?? "").replace(/\u200b/g, "") };
  } finally {
    await cdp.detach();
  }
}

for (const { command, id, initial, chosen } of SELECTS) {
  test(`the CLI explorer's ${command} select opens the design system's list, not the OS one`, async ({ page }, testInfo) => {
    failOnConsoleErrors(page, testInfo);
    await page.goto("/playgrounds/cli-explorer.html");
    await page.locator(`[data-action="select-command"][data-value="${command}"]`).click();

    // The native select is the one the runtime took over: it still holds the value, but it is out of
    // the tab order and the accessibility tree, and its own trigger is the control a reader tabs to.
    const native = page.locator(`.select-field > #${id}`);
    await expect(native).toHaveAttribute("aria-hidden", "true");
    await expect(native).toHaveAttribute("tabindex", "-1");

    // As a native select is announced: the name is the select's <label for>, as it is shown, and the
    // value is the chosen option, once each.
    const selector = `.select-field > #${id} ~ [role="combobox"]`;
    const trigger = page.locator(selector);
    const label = await page.locator(`label[for="${id}"]`).innerText();
    await expect(trigger).toBeVisible();
    await expect.poll(() => announced(page, selector)).toEqual({ name: label, value: initial });
    await trigger.click();
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveText(await native.locator("option").allTextContents());
    await list.getByRole("option", { name: "Hook" }).click();
    await expect(list).toHaveCount(0);

    await expect(page.locator("#cmdText")).toHaveText(chosen);
    await expect(page.locator(`.select-field > #${id}`)).toHaveValue("hook");
    await expect.poll(() => announced(page, selector)).toEqual({ name: label, value: "Hook" });
  });
}

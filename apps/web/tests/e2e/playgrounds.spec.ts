import { expect, failOnConsoleErrors, test } from "./helpers";

// Daniel, 2026-09-28: "A dropdown should ALWAYS have the custom layout for the list, not the
// system one." The playgrounds vendor the latest @danieldeusing/design on every build, so this
// is what proves its select runtime still takes over every <select> they render, and names it.
// One case per select: `add` has its select on load, `list` and `remove` render theirs later, and
// choosing a type re-renders the panel that holds it, so each is a node the runtime enhanced after
// the page had loaded.
const SELECTS = [
  { command: "add", id: "addType", label: "Type", initial: "Skill", chosen: "$ npx seedr add project-security-guard --type hook" },
  { command: "list", id: "listType", label: "Type Filter", initial: "All types", chosen: "$ npx seedr list --type hook" },
  { command: "remove", id: "removeType", label: "Type", initial: "Skill", chosen: "$ npx seedr remove pdf --type hook" },
];

for (const { command, id, label, initial, chosen } of SELECTS) {
  test(`the CLI explorer's ${command} select opens the design system's list, not the OS one`, async ({ page }, testInfo) => {
    failOnConsoleErrors(page, testInfo);
    await page.goto("/playgrounds/cli-explorer.html");
    await page.locator(`[data-action="select-command"][data-value="${command}"]`).click();

    // The native select is the one the runtime took over: it still holds the value, but it is out of
    // the tab order and the accessibility tree, and its own trigger is the control a reader tabs to.
    const native = page.locator(`.select-field > #${id}`);
    await expect(native).toHaveAttribute("aria-hidden", "true");
    await expect(native).toHaveAttribute("tabindex", "-1");

    // The trigger is named by the select's <label for> and its value, as a native select is announced.
    const trigger = page.getByRole("combobox", { name: `${label} ${initial}`, exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();
    const list = page.getByRole("listbox");
    await expect(list.getByRole("option")).toHaveText(await native.locator("option").allTextContents());
    await list.getByRole("option", { name: "Hook" }).click();
    await expect(list).toHaveCount(0);

    await expect(page.locator("#cmdText")).toHaveText(chosen);
    await expect(page.locator(`.select-field > #${id}`)).toHaveValue("hook");
    await expect(page.getByRole("combobox", { name: `${label} Hook`, exact: true })).toHaveText("Hook");
  });
}

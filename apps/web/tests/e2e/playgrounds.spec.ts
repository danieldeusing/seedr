import { expect, failOnConsoleErrors, test } from "./helpers";

// Daniel, 2026-09-28: "A dropdown should ALWAYS have the custom layout for the list, not the
// system one." The playgrounds vendor the latest @danieldeusing/design on every build, so this
// is what proves its select runtime still takes over every <select> they render.
test("the CLI explorer's selects open the design system's list, not the OS one", async ({ page }, testInfo) => {
  failOnConsoleErrors(page, testInfo);
  const bare = page.locator("select:not(.select-field > select)");

  await page.goto("/playgrounds/cli-explorer.html");
  await expect(page.locator(".select-field > select")).toHaveCount(1);
  await expect(bare).toHaveCount(0);

  await page.getByRole("combobox").click();
  const list = page.getByRole("listbox");
  await expect(list.getByRole("option")).toHaveCount(6);
  await list.getByRole("option", { name: "Hook" }).click();
  await expect(page.locator("#cmdText")).toHaveText("$ npx seedr add project-security-guard --type hook");

  // The type change re-renders the options panel and `list` renders a select of its own: both are
  // new nodes, enhanced after the page loaded.
  await expect(page.getByRole("combobox")).toHaveText("Hook");
  await page.locator('[data-action="select-command"][data-value="list"]').click();
  await expect(page.getByRole("combobox")).toHaveText("All types");
  await expect(bare).toHaveCount(0);
});

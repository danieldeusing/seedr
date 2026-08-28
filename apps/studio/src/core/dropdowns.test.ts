import { afterEach, describe, expect, test } from "vitest";
import { closeDropdownsOnOutsidePress } from "./lib/dropdowns";

let stop: (() => void) | null = null;

afterEach(() => {
  stop?.();
  stop = null;
  document.body.innerHTML = "";
});

const press = (node: Node) => node.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

function build(): { menu: HTMLDetailsElement; item: HTMLElement; outside: HTMLElement } {
  document.body.innerHTML = `
    <details class="dropdown" open><summary>open me</summary><div><button id="item">pick</button></div></details>
    <main id="outside">the workspace</main>`;
  stop = closeDropdownsOnOutsidePress();
  return {
    menu: document.querySelector("details")!,
    item: document.getElementById("item")!,
    outside: document.getElementById("outside")!,
  };
}

describe("dismissing a dropdown", () => {
  test("a press anywhere else closes it", () => {
    // The whole complaint: it used to close only on its own summary.
    const { menu, outside } = build();
    press(outside);
    expect(menu.open).toBe(false);
  });

  test("a press inside it does not — the item still gets its click", () => {
    const { menu, item } = build();
    press(item);
    expect(menu.open).toBe(true);
  });

  test("only the open ones are touched, and only those the press missed", () => {
    document.body.innerHTML = `
      <details class="dropdown" id="a" open><summary>a</summary></details>
      <details class="dropdown" id="b" open><summary>b</summary></details>`;
    stop = closeDropdownsOnOutsidePress();
    const a = document.getElementById("a") as HTMLDetailsElement;
    const b = document.getElementById("b") as HTMLDetailsElement;

    // Pressing one menu's summary closes the other and leaves this one to the
    // browser's own toggle.
    press(b.querySelector("summary")!);
    expect(a.open).toBe(false);
    expect(b.open).toBe(true);
  });

  test("unsubscribing stops it, so a remount does not leave two listeners", () => {
    const { menu, outside } = build();
    stop?.();
    stop = null;
    press(outside);
    expect(menu.open).toBe(true);
  });
});

/**
 * Close any open `details.dropdown` when the next press lands outside it.
 *
 * Native `<details>` only toggles on its own summary, so a menu left open
 * stayed open while you clicked elsewhere in the app — and the only way to
 * dismiss it was to find the exact button again.
 *
 * One listener for all of them rather than one per menu: three menus share the
 * `dropdown` class today, they behave identically, and a per-menu hook would be
 * three subscriptions and three chances for a new menu to be written without
 * one.
 *
 * `pointerdown` in the CAPTURE phase, so the menu is gone before whatever was
 * pressed reacts. A press *inside* an open menu is left alone: its own item
 * handlers close it, and the summary's native toggle still works.
 */
export function closeDropdownsOnOutsidePress(target: Document = document): () => void {
  const onPointerDown = (event: Event) => {
    for (const details of target.querySelectorAll<HTMLDetailsElement>("details.dropdown[open]")) {
      if (!details.contains(event.target as Node)) details.removeAttribute("open");
    }
  };
  target.addEventListener("pointerdown", onPointerDown, true);
  return () => target.removeEventListener("pointerdown", onPointerDown, true);
}

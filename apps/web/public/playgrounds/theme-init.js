// Applies the stored theme before first paint (shared by every playground page).
/* global document, localStorage */
// Loaded synchronously from <head> so the page never flashes the default theme.
(() => {
  const backgrounds = { warm: "#f5efe2", green: "#020604", mono: "#050505", paper: "#fafafa" };
  let theme = "warm";
  try {
    const stored = localStorage.getItem("theme");
    if (stored && stored in backgrounds) theme = stored;
  } catch {
    /* localStorage unavailable (private mode) — keep the default */
  }
  document.documentElement.dataset.theme = theme;
})();

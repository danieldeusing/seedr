// The design system's runtime for every playground page, loaded as a module
// (the CSP allows no inline script). initSelects() replaces the operating
// system's dropdown list with the design system's own, and keeps doing so for
// selects a page renders later: cli-explorer.js builds its selects in JS.
import { initSelects } from "./vendor/runtime/index.js";

initSelects();

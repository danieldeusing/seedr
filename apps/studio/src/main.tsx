import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// The estate runtime: one tooltip panel for every [data-tip] (hover and focus,
// aria-describedby while open) and the details.dropdown behaviour (one open,
// click-away, Escape). Both keep watching nodes rendered later.
import { initDropdowns, initTooltips } from "@danieldeusing/design/runtime";
import { App } from "./App";
import "./styles/index.css";

initTooltips();
initDropdowns();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

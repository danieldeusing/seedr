import { create } from "zustand";

export type RowStyle = "icons" | "text";

const read = (): RowStyle => {
  try {
    return window.localStorage.getItem("studio-row-style") === "text" ? "text" : "icons";
  } catch {
    return "icons";
  }
};

interface RowStyleState {
  style: RowStyle;
  setStyle(style: RowStyle): void;
}

/** How explorer rows show ownership and the agent matrix: brand marks, or `rw-`/`cgaxo` text. */
export const useRowStyle = create<RowStyleState>((set) => ({
  style: read(),
  setStyle(style) {
    try {
      window.localStorage.setItem("studio-row-style", style);
    } catch {
      // storage unavailable: the choice still holds for this session
    }
    set({ style });
  },
}));

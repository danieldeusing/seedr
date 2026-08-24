import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";
import { ThemeSwitch } from "./ThemeSwitch";

// This jsdom build ships window.localStorage as an empty object; the component
// only needs the Storage contract, so the test provides it.
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, String(value)),
    removeItem: (key: string) => void stored.delete(key),
  },
});

beforeEach(() => {
  document.documentElement.dataset.theme = "warm";
  stored.clear();
});

describe("ThemeSwitch", () => {
  test("cycles through the four estate themes and persists the choice", async () => {
    render(<ThemeSwitch />);
    await userEvent.click(screen.getByRole("button", { name: "theme: warm" }));
    expect(document.documentElement.dataset.theme).toBe("green");
    expect(stored.get("theme")).toBe("green");

    await userEvent.click(screen.getByRole("button", { name: "theme: green" }));
    await userEvent.click(screen.getByRole("button", { name: "theme: mono" }));
    await userEvent.click(screen.getByRole("button", { name: "theme: paper" }));
    expect(document.documentElement.dataset.theme).toBe("warm");
    expect(stored.get("theme")).toBe("warm");
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { useState } from "react";
import { Select } from "./Select";

function Harness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState("project");
  return (
    <Select
      ariaLabel="scope"
      value={value}
      options={[
        { value: "", label: "no default scope" },
        { value: "user", label: "user" },
        { value: "project", label: "project" },
      ]}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe("Select", () => {
  test("opens our own listbox, marks the selection, chooses by click", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "scope" });
    expect(trigger).toHaveTextContent("project");
    await userEvent.click(trigger);

    const listbox = screen.getByRole("listbox", { name: "scope" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "project" })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(screen.getByRole("option", { name: "user" }));
    expect(onChange).toHaveBeenCalledWith("user");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(trigger).toHaveTextContent("user");
  });

  test("keyboard: arrows move the highlight, Enter chooses, Escape closes", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: "scope" });
    trigger.focus();

    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();

    // reopen: the highlight starts on the selection (project); one up is user
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowUp}");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("user");
  });
});

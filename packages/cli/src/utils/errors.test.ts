import { describe, it, expect, vi, afterEach } from "vitest";
import { handleCommandError } from "./errors.js";

describe("handleCommandError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the message and exits with 1", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    handleCommandError(new Error("boom"));

    expect(errorSpy).toHaveBeenCalledWith("Error: boom");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("handles non-Error values", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    handleCommandError("string failure");

    expect(errorSpy).toHaveBeenCalledWith("Error: Unknown error");
  });
});

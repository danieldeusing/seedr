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

    // A thrown string used to degrade to "Unknown error" — zero information.
    expect(errorSpy).toHaveBeenCalledWith("Error: string failure");
  });

  it("prints the wrapped cause chain, which is what names the real failure", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const root = new Error("getaddrinfo ENOTFOUND registry.example");
    handleCommandError(new Error("Registry unreachable: https://registry.example/manifest.json", { cause: root }));

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Registry unreachable"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("caused by: getaddrinfo ENOTFOUND"));
  });

  it("handles a non-Error cause without crashing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    handleCommandError(new Error("outer", { cause: { code: 500 } }));

    expect(errorSpy).toHaveBeenCalledWith("Error: outer");
  });
});

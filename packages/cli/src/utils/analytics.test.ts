import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InstallResult } from "../handlers/types.js";

const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));

vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal("CLI_VERSION", "0.1.44");

let trackInstalls: typeof import("./analytics.js")["trackInstalls"];

beforeEach(async () => {
  fetchMock.mockClear();
  delete process.env.SEEDR_NO_TELEMETRY;
  // Re-import to get fresh module
  const mod = await import("./analytics.js");
  trackInstalls = mod.trackInstalls;
});

afterEach(() => {
  delete process.env.SEEDR_NO_TELEMETRY;
});

describe("trackInstalls", () => {
  it("sends a POST for each successful result", () => {
    const results: InstallResult[] = [
      { agent: "claude", success: true, path: "/some/path" },
      { agent: "copilot", success: true, path: "/other/path" },
    ];

    trackInstalls("pdf", "skill", results, "project");

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://seedr.danieldeusing.de/api/installs");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      slug: "pdf",
      type: "skill",
      agent: "claude",
      scope: "project",
      version: "0.1.44",
    });
  });

  it("skips failed results", () => {
    const results: InstallResult[] = [
      { agent: "claude", success: true, path: "/some/path" },
      { agent: "copilot", success: false, path: "", error: "failed" },
    ];

    trackInstalls("pdf", "skill", results, "project");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.agent).toBe("claude");
  });

  it("does nothing when SEEDR_NO_TELEMETRY is set", () => {
    process.env.SEEDR_NO_TELEMETRY = "1";

    const results: InstallResult[] = [
      { agent: "claude", success: true, path: "/some/path" },
    ];

    trackInstalls("pdf", "skill", results, "project");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for empty results", () => {
    trackInstalls("pdf", "skill", [], "project");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

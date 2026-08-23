import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { InstallResult } from "../handlers/types.js";
import type { InstallEvent } from "./analytics.js";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);
vi.stubGlobal("CLI_VERSION", "0.1.44");

const SUCCESS_CLAUDE: InstallResult = { agent: "claude", success: true, path: "/some/path" };
const SUCCESS_COPILOT: InstallResult = { agent: "copilot", success: true, path: "/other/path" };
const FAILED_COPILOT: InstallResult = { agent: "copilot", success: false, path: "", error: "failed" };

let trackInstalls: typeof import("./analytics.js")["trackInstalls"];
let isTelemetryDisabled: typeof import("./analytics.js")["isTelemetryDisabled"];
let ANALYTICS_URL: string;
let TELEMETRY_HELP_TEXT: string;

beforeEach(async () => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("ok"));
  delete process.env.SEEDR_NO_TELEMETRY;
  const mod = await import("./analytics.js");
  trackInstalls = mod.trackInstalls;
  isTelemetryDisabled = mod.isTelemetryDisabled;
  ANALYTICS_URL = mod.ANALYTICS_URL;
  TELEMETRY_HELP_TEXT = mod.TELEMETRY_HELP_TEXT;
});

afterEach(() => {
  delete process.env.SEEDR_NO_TELEMETRY;
});

describe("trackInstalls", () => {
  it("sends exactly one POST per successful agent target", async () => {
    await trackInstalls("pdf", "skill", [SUCCESS_CLAUDE, SUCCESS_COPILOT, FAILED_COPILOT], "project");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tools = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).tool);
    expect(tools).toEqual(["claude", "copilot"]);
  });

  it("sends exactly the documented payload fields and nothing else", async () => {
    await trackInstalls("pdf", "skill", [SUCCESS_CLAUDE], "project");

    const [url, opts] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://seedr.danieldeusing.de/api/installs");
    expect(url).toBe(ANALYTICS_URL);
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(opts.signal).toBeInstanceOf(AbortSignal);

    const body: InstallEvent = JSON.parse(opts.body);
    expect(body).toEqual({ slug: "pdf", type: "skill", tool: "claude", scope: "project", version: "0.1.44" });
    expect(Object.keys(body).sort()).toEqual(["scope", "slug", "tool", "type", "version"]);
  });

  it("skips failed results", async () => {
    await trackInstalls("pdf", "skill", [SUCCESS_CLAUDE, FAILED_COPILOT], "project");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).tool).toBe("claude");
  });

  it.each(["1", "true", "0", "false", ""])("performs zero fetch calls when SEEDR_NO_TELEMETRY=%j", async (value) => {
    process.env.SEEDR_NO_TELEMETRY = value;
    expect(isTelemetryDisabled()).toBe(true);

    await trackInstalls("pdf", "skill", [SUCCESS_CLAUDE, SUCCESS_COPILOT], "project");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is enabled only when the variable is unset", () => {
    expect(isTelemetryDisabled({})).toBe(false);
    expect(isTelemetryDisabled({ SEEDR_NO_TELEMETRY: "0" })).toBe(true);
  });

  it("does nothing for empty results", async () => {
    await trackInstalls("pdf", "skill", [], "project");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves even when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(trackInstalls("pdf", "skill", [SUCCESS_CLAUDE, SUCCESS_COPILOT], "project")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves even when fetch throws synchronously", async () => {
    fetchMock.mockImplementation(() => {
      throw new TypeError("fetch is not available");
    });
    await expect(trackInstalls("pdf", "skill", [SUCCESS_CLAUDE], "project")).resolves.toBeUndefined();
  });

  it("resolves when the request times out", async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" }));
    await expect(trackInstalls("pdf", "skill", [SUCCESS_CLAUDE], "project")).resolves.toBeUndefined();
  });

  it("documents the counting semantics and the opt-out in the help text", () => {
    expect(TELEMETRY_HELP_TEXT).toBe(
      "Sends one anonymous install event per successful agent target to https://seedr.danieldeusing.de/api/installs; set SEEDR_NO_TELEMETRY=1 to disable"
    );
  });
});

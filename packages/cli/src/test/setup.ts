import { vi } from "vitest";

// Mock ora spinner to prevent console output during tests
vi.mock("ora", () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    warn: vi.fn().mockReturnThis(),
    info: vi.fn().mockReturnThis(),
    text: "",
  }),
}));

// Mock chalk to return plain strings (no color codes)
vi.mock("chalk", () => ({
  default: {
    cyan: (s: string) => s,
    green: (s: string) => s,
    red: (s: string) => s,
    yellow: (s: string) => s,
    gray: (s: string) => s,
    white: (s: string) => s,
    blue: (s: string) => s,
    magenta: (s: string) => s,
    hex: () => (s: string) => s,
    bgHex: () => ({ black: (s: string) => s }),
    bgCyan: { black: (s: string) => s },
  },
}));

// Every agent's configuration root can be relocated by an environment
// variable, and the resolvers read them. A machine that sets one — CI runners
// commonly set XDG_CONFIG_HOME — would otherwise change where the suite
// expects files, so a test could pass on a developer's laptop and fail on
// Linux. Clear them all: a test that cares sets its own and restores it.
for (const variable of [
  "CLAUDE_CONFIG_DIR",
  "COPILOT_HOME",
  "CODEX_HOME",
  "OPENCODE_CONFIG_DIR",
  "XDG_CONFIG_HOME",
]) {
  delete process.env[variable];
}

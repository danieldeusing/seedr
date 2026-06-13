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

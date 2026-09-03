import { describe, expect, test } from "vitest";
import { relativeDay } from "./relativeDay";

describe("relativeDay", () => {
  const now = new Date(2026, 8, 3, 9, 30); // 3 September 2026, local time

  test("counts calendar days, not 24-hour spans", () => {
    expect(relativeDay(new Date(2026, 8, 3, 0, 5).toISOString(), now)).toBe("today");
    expect(relativeDay(new Date(2026, 8, 2, 23, 55).toISOString(), now)).toBe("yesterday");
    expect(relativeDay(new Date(2026, 7, 22, 12, 0).toISOString(), now)).toBe("12 days ago");
  });

  test("a source clock ahead of ours is still today, and nonsense stays as it was", () => {
    expect(relativeDay(new Date(2026, 8, 4, 1, 0).toISOString(), now)).toBe("today");
    expect(relativeDay("not a date", now)).toBe("not a date");
  });
});

import { describe, expect, it } from "vitest";
import { isWithinSchedule } from "@/lib/schedule";

const base = {
  scheduleEnabled: true,
  timezone: "Etc/UTC",
};

describe("conversion schedule", () => {
  it("handles a normal daily window", () => {
    const config = { ...base, scheduleStart: "08:00", scheduleEnd: "17:00" };
    expect(isWithinSchedule(config, new Date("2026-01-01T12:00:00Z"))).toBe(true);
    expect(isWithinSchedule(config, new Date("2026-01-01T20:00:00Z"))).toBe(false);
  });

  it("handles a window crossing midnight", () => {
    const config = { ...base, scheduleStart: "22:00", scheduleEnd: "06:00" };
    expect(isWithinSchedule(config, new Date("2026-01-01T23:00:00Z"))).toBe(true);
    expect(isWithinSchedule(config, new Date("2026-01-01T03:00:00Z"))).toBe(true);
    expect(isWithinSchedule(config, new Date("2026-01-01T12:00:00Z"))).toBe(false);
  });

  it("uses the configured timezone across daylight-saving dates", () => {
    const config = {
      ...base,
      timezone: "Europe/Stockholm",
      scheduleStart: "08:00",
      scheduleEnd: "10:00",
    };
    expect(isWithinSchedule(config, new Date("2026-06-01T06:30:00Z"))).toBe(true);
    expect(isWithinSchedule(config, new Date("2026-12-01T07:30:00Z"))).toBe(true);
  });
});

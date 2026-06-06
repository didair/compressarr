import { describe, expect, it } from "vitest";
import {
  appSettingsSchema,
  defaultSettings,
  isCodecEligible,
} from "@/lib/settings";

describe("settings", () => {
  it("provides conservative codec defaults", () => {
    expect(isCodecEligible("h264", defaultSettings)).toBe(true);
    expect(isCodecEligible("hevc", defaultSettings)).toBe(false);
    expect(isCodecEligible("av1", defaultSettings)).toBe(false);
  });

  it("rejects malformed schedules and empty codec lists", () => {
    expect(() =>
      appSettingsSchema.parse({
        ...defaultSettings,
        scheduleStart: "25:00",
      }),
    ).toThrow();
    expect(() =>
      appSettingsSchema.parse({ ...defaultSettings, eligibleCodecs: [] }),
    ).toThrow();
  });
});

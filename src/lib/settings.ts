import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { settings } from "@/db/schema";

export const codecOptions = [
  { id: "h264", label: "H.264 / AVC" },
  { id: "mpeg2video", label: "MPEG-2" },
  { id: "mpeg4", label: "MPEG-4 Part 2" },
  { id: "vc1", label: "VC-1" },
  { id: "wmv3", label: "Windows Media Video 9" },
  { id: "msmpeg4v3", label: "Microsoft MPEG-4 v3" },
  { id: "mpeg1video", label: "MPEG-1" },
  { id: "theora", label: "Theora" },
  { id: "vp8", label: "VP8" },
  { id: "hevc", label: "H.265 / HEVC" },
  { id: "av1", label: "AV1" },
  { id: "vp9", label: "VP9" },
] as const;

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const appSettingsSchema = z.object({
  minimumFileAgeHours: z.number().min(0).max(8760),
  minimumFileAgeUnit: z.enum(["minutes", "hours", "days", "weeks", "months"]),
  scanIntervalMinutes: z.number().int().min(1).max(10080),
  scanIntervalUnit: z.enum(["minutes", "hours", "days"]),
  eligibleCodecs: z.array(z.string()).min(1),
  qualityProfile: z.enum(["high", "balanced", "compact"]),
  minimumSavingsPercent: z.number().min(0).max(99),
  scheduleEnabled: z.boolean(),
  scheduleStart: z.string().regex(timePattern),
  scheduleEnd: z.string().regex(timePattern),
  timezone: z.string().min(1),
  automaticRetryCount: z.number().int().min(0).max(10),
  queuePaused: z.boolean(),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const defaultSettings: AppSettings = {
  minimumFileAgeHours: 24,
  minimumFileAgeUnit: "hours",
  scanIntervalMinutes: 60,
  scanIntervalUnit: "minutes",
  eligibleCodecs: [
    "h264",
    "mpeg2video",
    "mpeg4",
    "vc1",
    "wmv3",
    "msmpeg4v3",
    "mpeg1video",
    "theora",
    "vp8",
  ],
  qualityProfile: "balanced",
  minimumSavingsPercent: 5,
  scheduleEnabled: false,
  scheduleStart: "00:00",
  scheduleEnd: "23:59",
  timezone: "Etc/UTC",
  automaticRetryCount: 2,
  queuePaused: false,
};

export function parseSettingValue<K extends keyof AppSettings>(
  key: K,
  value: string,
): AppSettings[K] {
  const candidate = {
    ...defaultSettings,
    [key]: JSON.parse(value) as unknown,
  };
  return appSettingsSchema.parse(candidate)[key];
}

export function getSettings(): AppSettings {
  const rows = db.select().from(settings).all();
  const result = { ...defaultSettings };

  for (const row of rows) {
    if (row.key in result) {
      try {
        const key = row.key as keyof AppSettings;
        Object.assign(result, { [key]: parseSettingValue(key, row.value) });
      } catch {
        // Invalid stored values fall back to the application default.
      }
    }
  }

  return appSettingsSchema.parse(result);
}

export function updateSettings(input: unknown): AppSettings {
  const value = appSettingsSchema.parse(input);
  const now = new Date();

  db.transaction((tx) => {
    for (const [key, settingValue] of Object.entries(value)) {
      tx.insert(settings)
        .values({ key, value: JSON.stringify(settingValue), updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: JSON.stringify(settingValue), updatedAt: now },
        })
        .run();
    }
  });

  return value;
}

export function setQueuePaused(paused: boolean): void {
  db.insert(settings)
    .values({
      key: "queuePaused",
      value: JSON.stringify(paused),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(paused), updatedAt: new Date() },
    })
    .run();
}

export function isCodecEligible(codec: string, config = getSettings()): boolean {
  return config.eligibleCodecs.includes(codec.toLowerCase());
}

export function removeSetting(key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run();
}

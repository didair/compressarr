import type { AppSettings } from "./settings";

function minutesInTimezone(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return hour * 60 + minute;
}

function parseTime(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function isWithinSchedule(
  config: Pick<
    AppSettings,
    "scheduleEnabled" | "scheduleStart" | "scheduleEnd" | "timezone"
  >,
  now = new Date(),
): boolean {
  if (!config.scheduleEnabled) return true;

  const current = minutesInTimezone(now, config.timezone);
  const start = parseTime(config.scheduleStart);
  const end = parseTime(config.scheduleEnd);

  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

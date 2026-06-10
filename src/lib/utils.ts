import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes === 0) return "0 B";

  const absoluteBytes = Math.abs(bytes);
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(absoluteBytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  const maximumFractionDigits = value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value)} ${units[index]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "Calculating";

  const totalSeconds = Math.max(0, Math.round(seconds));
  if (totalSeconds < 60) return totalSeconds === 1 ? "1 sec" : `${totalSeconds} sec`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) {
    return minutes ? `${totalHours} hr ${minutes} min` : `${totalHours} hr`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const dayLabel = days === 1 ? "day" : "days";
  return hours ? `${days} ${dayLabel} ${hours} hr` : `${days} ${dayLabel}`;
}

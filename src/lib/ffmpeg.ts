import type { QualityProfile } from "@/db/schema";
import type { AppSettings } from "./settings";

export const qualityCrf: Record<QualityProfile, number> = {
  high: 18,
  balanced: 22,
  compact: 26,
};

export const resolutionBounds: Record<
  Exclude<AppSettings["maximumResolution"], "keep">,
  { width: number; height: number }
> = {
  "8k": { width: 7680, height: 4320 },
  "4k": { width: 3840, height: 2160 },
  "1080p": { width: 1920, height: 1080 },
  "720p": { width: 1280, height: 720 },
};

export function buildFfmpegArgs(
  sourcePath: string,
  temporaryPath: string,
  profile: QualityProfile,
  maximumResolution: AppSettings["maximumResolution"],
): string[] {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-map",
    "0:s?",
    "-map",
    "0:t?",
    "-map_metadata",
    "0",
    "-map_chapters",
    "0",
    "-c",
    "copy",
    "-c:v:0",
    "libx265",
    "-preset",
    "medium",
    "-crf",
    String(qualityCrf[profile]),
  ];
  if (maximumResolution !== "keep") {
    const bounds = resolutionBounds[maximumResolution];
    args.push(
      "-filter:v:0",
      `scale=${bounds.width}:${bounds.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    );
  }
  args.push(
    "-max_muxing_queue_size",
    "4096",
    "-progress",
    "pipe:1",
    "-nostats",
    "-f",
    "matroska",
    temporaryPath,
  );
  return args;
}

export function outputPathFor(sourcePath: string): string {
  return sourcePath.replace(/\.[^/.]+$/, "") + ".mkv";
}

export function savingsPercent(sourceBytes: number, outputBytes: number): number {
  if (sourceBytes <= 0) return 0;
  return ((sourceBytes - outputBytes) / sourceBytes) * 100;
}

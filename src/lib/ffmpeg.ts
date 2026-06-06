import type { QualityProfile } from "@/db/schema";

export const qualityCrf: Record<QualityProfile, number> = {
  high: 18,
  balanced: 22,
  compact: 26,
};

export function buildFfmpegArgs(
  sourcePath: string,
  temporaryPath: string,
  profile: QualityProfile,
): string[] {
  return [
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
    "-max_muxing_queue_size",
    "4096",
    "-progress",
    "pipe:1",
    "-nostats",
    "-f",
    "matroska",
    temporaryPath,
  ];
}

export function outputPathFor(sourcePath: string): string {
  return sourcePath.replace(/\.[^/.]+$/, "") + ".mkv";
}

export function savingsPercent(sourceBytes: number, outputBytes: number): number {
  if (sourceBytes <= 0) return 0;
  return ((sourceBytes - outputBytes) / sourceBytes) * 100;
}

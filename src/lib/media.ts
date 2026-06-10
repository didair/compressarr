import { spawn } from "node:child_process";

export const videoExtensions = new Set([
  ".3gp",
  ".avi",
  ".flv",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mts",
  ".ogm",
  ".ts",
  ".vob",
  ".webm",
  ".wmv",
]);

export interface ProbeStream {
  index: number;
  codec_name?: string;
  codec_type?: "video" | "audio" | "subtitle" | "attachment" | "data";
  width?: number;
  height?: number;
  disposition?: { attached_pic?: number };
}

export interface ProbeResult {
  streams: ProbeStream[];
  format: {
    duration?: string;
    format_name?: string;
    size?: string;
  };
  chapters?: unknown[];
}

export interface MediaInfo {
  durationSeconds: number;
  container: string;
  primaryVideoCodec: string;
  width: number;
  height: number;
  audioStreamCount: number;
  subtitleStreamCount: number;
  streams: ProbeStream[];
}

export async function probeMedia(filePath: string): Promise<MediaInfo> {
  const result = await runJsonProcess("ffprobe", [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    "-of",
    "json",
    filePath,
  ]);
  const parsed = result as ProbeResult;
  const videos = parsed.streams.filter(
    (stream) =>
      stream.codec_type === "video" && stream.disposition?.attached_pic !== 1,
  );
  const primary = videos[0];
  const duration = Number(parsed.format.duration);

  if (
    !primary?.codec_name ||
    !primary.width ||
    !primary.height ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new MediaProbeError("No valid primary video stream was found.");
  }

  return {
    durationSeconds: duration,
    container: parsed.format.format_name ?? "unknown",
    primaryVideoCodec: primary.codec_name.toLowerCase(),
    width: primary.width,
    height: primary.height,
    audioStreamCount: parsed.streams.filter(
      (stream) => stream.codec_type === "audio",
    ).length,
    subtitleStreamCount: parsed.streams.filter(
      (stream) => stream.codec_type === "subtitle",
    ).length,
    streams: parsed.streams,
  };
}

async function runJsonProcess(command: string, args: string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new MediaProbeError(stderr.trim() || `${command} exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new MediaProbeError("ffprobe returned invalid JSON."));
      }
    });
  });
}

export class MediaProbeError extends Error {
  readonly code = "MEDIA_PROBE_FAILED";
}

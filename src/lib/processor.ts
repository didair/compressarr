import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, type Job } from "@/db/schema";
import { buildFfmpegArgs, outputPathFor, savingsPercent } from "./ffmpeg";
import { probeMedia } from "./media";
import { getSettings, isCodecEligible } from "./settings";

export async function processJob(job: Job): Promise<void> {
  const temporaryPath = temporaryPathFor(job.sourcePath);
  const finalPath = outputPathFor(job.sourcePath);
  let child: ChildProcess | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let cancellation: NodeJS.Timeout | undefined;

  try {
    const config = getSettings();
    const sourceStat = await fs.stat(job.sourcePath);
    const sourceFingerprint = `${sourceStat.size}:${Math.floor(sourceStat.mtimeMs)}`;
    const currentMedia = await probeMedia(job.sourcePath);
    const storedFingerprint = db.query.mediaFiles
      .findFirst({
        where: (media, { eq: equals }) => equals(media.id, job.mediaFileId),
      })
      .sync()?.fingerprint;

    if (sourceFingerprint !== storedFingerprint) {
      throw new ProcessingError(
        "SOURCE_CHANGED",
        "The source changed after it was queued.",
        false,
      );
    }
    if (!isCodecEligible(currentMedia.primaryVideoCodec, config)) {
      throw new ProcessingError(
        "SOURCE_NOT_ELIGIBLE",
        "The source codec is no longer eligible.",
        false,
      );
    }
    if (finalPath !== job.sourcePath && (await exists(finalPath))) {
      throw new ProcessingError(
        "OUTPUT_EXISTS",
        `Output already exists: ${finalPath}`,
        false,
      );
    }

    const disk = await fs.statfs(path.dirname(job.sourcePath), { bigint: true });
    const freeBytes = disk.bavail * disk.bsize;
    if (freeBytes < BigInt(sourceStat.size)) {
      throw new ProcessingError(
        "INSUFFICIENT_SPACE",
        "Not enough free space to create the temporary output.",
        true,
      );
    }

    await fs.rm(temporaryPath, { force: true });
    child = spawn(
      "ffmpeg",
      buildFfmpegArgs(job.sourcePath, temporaryPath, job.qualityProfile),
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    heartbeat = setInterval(() => {
      db.update(jobs)
        .set({ workerHeartbeatAt: new Date() })
        .where(eq(jobs.id, job.id))
        .run();
    }, 10_000);

    cancellation = setInterval(() => {
      const current = db
        .select({ requested: jobs.cancellationRequestedAt })
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .get();
      if (current?.requested && child && !child.killed) {
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child && child.exitCode === null) child.kill("SIGKILL");
        }, 10_000).unref();
      }
    }, 1_000);

    await runFfmpeg(child, job, currentMedia.durationSeconds);

    const cancelled = db
      .select({ requested: jobs.cancellationRequestedAt })
      .from(jobs)
      .where(eq(jobs.id, job.id))
      .get()?.requested;
    if (cancelled) {
      await fs.rm(temporaryPath, { force: true });
      completeJob(job.id, "cancelled", {
        errorCode: "CANCELLED_BY_USER",
        errorMessage: "Cancelled by user.",
      });
      return;
    }

    const outputInfo = await probeMedia(temporaryPath);
    validateOutput(currentMedia, outputInfo);
    const outputStat = await fs.stat(temporaryPath);
    const actualSavings = savingsPercent(sourceStat.size, outputStat.size);
    if (actualSavings < config.minimumSavingsPercent) {
      await fs.rm(temporaryPath, { force: true });
      completeJob(job.id, "skipped", {
        outputSizeBytes: outputStat.size,
        savedBytes: 0,
        errorCode: "INSUFFICIENT_SAVINGS",
        errorMessage: `Output saved ${actualSavings.toFixed(1)}%; ${config.minimumSavingsPercent}% is required.`,
      });
      return;
    }

    await fs.chmod(temporaryPath, sourceStat.mode);
    await fs.utimes(temporaryPath, sourceStat.atime, sourceStat.mtime);

    if (finalPath === job.sourcePath) {
      await fs.rename(temporaryPath, job.sourcePath);
    } else {
      if (await exists(finalPath)) {
        throw new ProcessingError(
          "OUTPUT_EXISTS",
          `Output appeared during conversion: ${finalPath}`,
          false,
        );
      }
      await fs.rename(temporaryPath, finalPath);
      await fs.unlink(job.sourcePath);
    }

    completeJob(job.id, "completed", {
      outputPath: finalPath,
      outputSizeBytes: outputStat.size,
      savedBytes: sourceStat.size - outputStat.size,
      progressPercent: 100,
      speed: null,
      etaSeconds: 0,
    });
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    const current = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
    if (current?.cancellationRequestedAt) {
      completeJob(job.id, "cancelled", {
        errorCode: "CANCELLED_BY_USER",
        errorMessage: "Cancelled by user.",
      });
      return;
    }
    await failOrRetry(job, error);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (cancellation) clearInterval(cancellation);
  }
}

async function runFfmpeg(
  child: ChildProcess,
  job: Job,
  duration: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let buffer = "";
    let progress: Record<string, string> = {};
    let lastUpdate = 0;

    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-16_000);
    });
    child.stdout!.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator < 0) continue;
        progress[line.slice(0, separator)] = line.slice(separator + 1);
        if (line === "progress=continue" || line === "progress=end") {
          if (Date.now() - lastUpdate > 1_000 || line === "progress=end") {
            persistProgress(job.id, duration, progress);
            lastUpdate = Date.now();
          }
          progress = {};
        }
      }
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new ProcessingError(
            "FFMPEG_FAILED",
            stderr.trim() || `FFmpeg exited with ${code ?? signal}.`,
            true,
          ),
        );
    });
  });
}

function persistProgress(
  jobId: number,
  duration: number,
  values: Record<string, string>,
): void {
  const outputSeconds = Number(values.out_time_us ?? 0) / 1_000_000;
  const percent = Math.max(0, Math.min(99.9, (outputSeconds / duration) * 100));
  const speedValue = Number((values.speed ?? "0x").replace("x", ""));
  const eta =
    speedValue > 0 ? Math.max(0, Math.round((duration - outputSeconds) / speedValue)) : null;
  db.update(jobs)
    .set({
      progressPercent: percent,
      speed: values.speed ?? null,
      etaSeconds: eta,
      workerHeartbeatAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
    .run();
}

function validateOutput(
  source: Awaited<ReturnType<typeof probeMedia>>,
  output: Awaited<ReturnType<typeof probeMedia>>,
): void {
  if (output.primaryVideoCodec !== "hevc") {
    throw new ProcessingError(
      "VALIDATION_CODEC",
      "Output primary video stream is not HEVC.",
      false,
    );
  }
  if (
    output.audioStreamCount !== source.audioStreamCount ||
    output.subtitleStreamCount !== source.subtitleStreamCount
  ) {
    throw new ProcessingError(
      "VALIDATION_STREAMS",
      "Output audio or subtitle stream counts do not match the source.",
      false,
    );
  }
  const tolerance = Math.max(1, source.durationSeconds * 0.001);
  if (Math.abs(output.durationSeconds - source.durationSeconds) > tolerance) {
    throw new ProcessingError(
      "VALIDATION_DURATION",
      "Output duration differs from the source.",
      false,
    );
  }
}

async function failOrRetry(job: Job, error: unknown): Promise<void> {
  const processing =
    error instanceof ProcessingError
      ? error
      : new ProcessingError(
          "PROCESSING_FAILED",
          error instanceof Error ? error.message : "Unknown processing failure.",
          true,
        );
  const current = db.select().from(jobs).where(eq(jobs.id, job.id)).get();
  const allowedAttempts = getSettings().automaticRetryCount + 1;

  if (processing.retryable && current && current.attemptCount < allowedAttempts) {
    const delayMinutes = 2 ** Math.max(0, current.attemptCount - 1);
    db.update(jobs)
      .set({
        status: "queued",
        availableAt: new Date(Date.now() + delayMinutes * 60_000),
        startedAt: null,
        workerHeartbeatAt: null,
        progressPercent: null,
        speed: null,
        etaSeconds: null,
        errorCode: processing.code,
        errorMessage: processing.message,
      })
      .where(eq(jobs.id, job.id))
      .run();
    return;
  }

  completeJob(job.id, "failed", {
    errorCode: processing.code,
    errorMessage: processing.message,
  });
}

function completeJob(
  jobId: number,
  status: "completed" | "failed" | "skipped" | "cancelled",
  values: Partial<typeof jobs.$inferInsert>,
): void {
  db.update(jobs)
    .set({
      ...values,
      status,
      completedAt: new Date(),
      workerHeartbeatAt: null,
    })
    .where(eq(jobs.id, jobId))
    .run();
}

function temporaryPathFor(sourcePath: string): string {
  return path.join(
    path.dirname(sourcePath),
    `.${path.basename(sourcePath)}.compressarr-${process.pid}.tmp.mkv`,
  );
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export class ProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

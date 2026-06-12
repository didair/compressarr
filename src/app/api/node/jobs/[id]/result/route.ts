import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs, mediaFiles } from "@/db/schema";
import { apiError } from "@/lib/api";
import { outputPathFor, resolutionBounds, savingsPercent } from "@/lib/ffmpeg";
import { probeMedia } from "@/lib/media";
import {
  authenticateLeasedJob,
  heartbeatRemoteJob,
  releaseRemoteNode,
} from "@/lib/remote-jobs";
import { getSettings } from "@/lib/settings";
import {
  cleanupTemporaryFilesForSource,
  temporaryPathForSource,
} from "@/lib/temp-files";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let temporaryPath: string | undefined;
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const lease = authenticateLeasedJob(request, id);
    if (!lease) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid job lease." } },
        { status: 401 },
      );
    }
    if (!request.body) {
      return Response.json(
        { error: { code: "EMPTY_RESULT", message: "No output was uploaded." } },
        { status: 400 },
      );
    }

    heartbeatRemoteJob(lease.node.id, lease.job.id);
    const sourceStat = await fsPromises.stat(
      /* turbopackIgnore: true */ lease.job.sourcePath,
    );
    const media = db
      .select()
      .from(mediaFiles)
      .where(eq(mediaFiles.id, lease.job.mediaFileId))
      .get();
    const fingerprint = `${sourceStat.size}:${Math.floor(sourceStat.mtimeMs)}`;
    if (!media || media.fingerprint !== fingerprint) {
      throw new RemoteResultError(
        "SOURCE_CHANGED",
        "The source changed while the remote node was processing it.",
      );
    }

    await cleanupTemporaryFilesForSource(lease.job.sourcePath);
    temporaryPath = temporaryPathForSource(
      lease.job.sourcePath,
      `remote-${id}`,
    );
    await fsPromises.rm(/* turbopackIgnore: true */ temporaryPath, {
      force: true,
    });
    await pipeline(
      Readable.fromWeb(request.body as never),
      fs.createWriteStream(/* turbopackIgnore: true */ temporaryPath, {
        flags: "wx",
      }),
    );
    const cancelled = db
      .select({ requestedAt: jobs.cancellationRequestedAt })
      .from(jobs)
      .where(eq(jobs.id, id))
      .get()?.requestedAt;
    if (cancelled) {
      await fsPromises.rm(/* turbopackIgnore: true */ temporaryPath, {
        force: true,
      });
      completeRemoteJob(id, "cancelled", {
        errorCode: "CANCELLED_BY_USER",
        errorMessage: "Cancelled by user.",
      });
      releaseRemoteNode(lease.node.id);
      return Response.json({ status: "cancelled" });
    }

    const settings = getSettings();
    const sourceInfo = await probeMedia(lease.job.sourcePath);
    const outputInfo = await probeMedia(temporaryPath);
    validateRemoteOutput(sourceInfo, outputInfo, settings.maximumResolution);

    const outputStat = await fsPromises.stat(
      /* turbopackIgnore: true */ temporaryPath,
    );
    const actualSavings = savingsPercent(sourceStat.size, outputStat.size);
    if (actualSavings < settings.minimumSavingsPercent) {
      await fsPromises.rm(/* turbopackIgnore: true */ temporaryPath, {
        force: true,
      });
      completeRemoteJob(id, "skipped", {
        outputSizeBytes: outputStat.size,
        savedBytes: 0,
        errorCode: "INSUFFICIENT_SAVINGS",
        errorMessage: `Output saved ${actualSavings.toFixed(1)}%; ${settings.minimumSavingsPercent}% is required.`,
      });
      releaseRemoteNode(lease.node.id);
      return Response.json({ status: "skipped", savingsPercent: actualSavings });
    }

    const finalPath = outputPathFor(lease.job.sourcePath);
    if (finalPath !== lease.job.sourcePath && (await exists(finalPath))) {
      throw new RemoteResultError(
        "OUTPUT_EXISTS",
        `Output already exists: ${finalPath}`,
      );
    }

    await fsPromises.chmod(
      /* turbopackIgnore: true */ temporaryPath,
      sourceStat.mode,
    );
    await fsPromises.utimes(
      /* turbopackIgnore: true */ temporaryPath,
      sourceStat.atime,
      sourceStat.mtime,
    );
    if (finalPath === lease.job.sourcePath) {
      await fsPromises.rename(
        /* turbopackIgnore: true */ temporaryPath,
        lease.job.sourcePath,
      );
    } else {
      await fsPromises.rename(
        /* turbopackIgnore: true */ temporaryPath,
        finalPath,
      );
      await fsPromises.unlink(
        /* turbopackIgnore: true */ lease.job.sourcePath,
      );
    }

    completeRemoteJob(id, "completed", {
      outputPath: finalPath,
      outputSizeBytes: outputStat.size,
      savedBytes: sourceStat.size - outputStat.size,
      progressPercent: 100,
      speed: null,
      etaSeconds: 0,
    });
    releaseRemoteNode(lease.node.id);
    return Response.json({
      status: "completed",
      savedBytes: sourceStat.size - outputStat.size,
    });
  } catch (error) {
    if (temporaryPath) {
      await fsPromises
        .rm(/* turbopackIgnore: true */ temporaryPath, { force: true })
        .catch(() => undefined);
    }
    if (error instanceof RemoteResultError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 422 },
      );
    }
    return apiError(error);
  }
}

function validateRemoteOutput(
  source: Awaited<ReturnType<typeof probeMedia>>,
  output: Awaited<ReturnType<typeof probeMedia>>,
  maximumResolution: ReturnType<typeof getSettings>["maximumResolution"],
): void {
  if (output.primaryVideoCodec !== "hevc") {
    throw new RemoteResultError(
      "VALIDATION_CODEC",
      "Output primary video stream is not HEVC.",
    );
  }
  if (
    output.audioStreamCount !== source.audioStreamCount ||
    output.subtitleStreamCount !== source.subtitleStreamCount
  ) {
    throw new RemoteResultError(
      "VALIDATION_STREAMS",
      "Output audio or subtitle stream counts do not match the source.",
    );
  }
  if (maximumResolution === "keep") {
    if (output.width !== source.width || output.height !== source.height) {
      throw new RemoteResultError(
        "VALIDATION_RESOLUTION",
        "Output resolution differs from the source.",
      );
    }
  } else {
    const bounds = resolutionBounds[maximumResolution];
    if (output.width > bounds.width || output.height > bounds.height) {
      throw new RemoteResultError(
        "VALIDATION_RESOLUTION",
        "Output resolution exceeds the configured maximum.",
      );
    }
  }
  const tolerance = Math.max(1, source.durationSeconds * 0.001);
  if (Math.abs(output.durationSeconds - source.durationSeconds) > tolerance) {
    throw new RemoteResultError(
      "VALIDATION_DURATION",
      "Output duration differs from the source.",
    );
  }
}

function completeRemoteJob(
  jobId: number,
  status: "completed" | "skipped" | "cancelled",
  values: Partial<typeof jobs.$inferInsert>,
): void {
  db.update(jobs)
    .set({
      ...values,
      status,
      completedAt: new Date(),
      workerHeartbeatAt: null,
      leaseExpiresAt: null,
      leaseTokenHash: null,
    })
    .where(eq(jobs.id, jobId))
    .run();
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await fsPromises.access(/* turbopackIgnore: true */ candidate);
    return true;
  } catch {
    return false;
  }
}

class RemoteResultError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

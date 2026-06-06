import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { directories, jobs, mediaFiles, type Directory } from "@/db/schema";
import { outputPathFor } from "./ffmpeg";
import { probeMedia } from "./media";
import { canonicalMediaPath } from "./paths";
import { getSettings, isCodecEligible } from "./settings";
import { videoExtensions } from "./media";

const temporaryMarker = ".compressarr-";

export async function scanDirectory(directory: Directory): Promise<number> {
  const startedAt = new Date();
  db.update(directories)
    .set({
      lastScanStartedAt: startedAt,
      lastScanError: null,
      scanRequestedAt: null,
    })
    .where(eq(directories.id, directory.id))
    .run();

  let discovered = 0;
  try {
    const root = await canonicalMediaPath(directory.path);
    for await (const filePath of walkVideoFiles(root)) {
      if (await discoverFile(directory, filePath)) discovered += 1;
    }
    db.update(directories)
      .set({ lastScanCompletedAt: new Date(), lastScanError: null })
      .where(eq(directories.id, directory.id))
      .run();
    return discovered;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown scan error";
    db.update(directories)
      .set({ lastScanCompletedAt: new Date(), lastScanError: message })
      .where(eq(directories.id, directory.id))
      .run();
    throw error;
  }
}

async function* walkVideoFiles(root: string): AsyncGenerator<string> {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop()!;
    let handle;
    try {
      handle = await fs.opendir(current);
    } catch {
      continue;
    }
    for await (const entry of handle) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (
        entry.isFile() &&
        !entry.name.includes(temporaryMarker) &&
        videoExtensions.has(path.extname(entry.name).toLowerCase())
      ) {
        yield entryPath;
      }
    }
  }
}

async function discoverFile(
  directory: Directory,
  candidate: string,
): Promise<boolean> {
  const config = getSettings();
  let canonical: string;
  let stat;
  try {
    canonical = await canonicalMediaPath(candidate);
    stat = await fs.stat(canonical);
  } catch {
    return false;
  }

  const ageMs = Date.now() - stat.mtimeMs;
  if (ageMs < config.minimumFileAgeHours * 60 * 60 * 1000) return false;

  let info;
  try {
    info = await probeMedia(canonical);
  } catch {
    return false;
  }
  if (!isCodecEligible(info.primaryVideoCodec, config)) return false;

  const fingerprint = `${stat.size}:${Math.floor(stat.mtimeMs)}`;
  const now = new Date();
  const existingMedia = db
    .select({ fingerprint: mediaFiles.fingerprint })
    .from(mediaFiles)
    .where(eq(mediaFiles.canonicalPath, canonical))
    .get();
  const media = db
    .insert(mediaFiles)
    .values({
      canonicalPath: canonical,
      directoryId: directory.id,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime,
      durationSeconds: info.durationSeconds,
      container: info.container,
      primaryVideoCodec: info.primaryVideoCodec,
      audioStreamCount: info.audioStreamCount,
      subtitleStreamCount: info.subtitleStreamCount,
      fingerprint,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: mediaFiles.canonicalPath,
      set: {
        directoryId: directory.id,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime,
        durationSeconds: info.durationSeconds,
        container: info.container,
        primaryVideoCodec: info.primaryVideoCodec,
        audioStreamCount: info.audioStreamCount,
        subtitleStreamCount: info.subtitleStreamCount,
        fingerprint,
        lastSeenAt: now,
        updatedAt: now,
      },
    })
    .returning()
    .get();

  const previous =
    existingMedia?.fingerprint === fingerprint
      ? db
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              eq(jobs.mediaFileId, media.id),
              inArray(jobs.status, ["queued", "running", "completed", "skipped"]),
              eq(jobs.sourceSizeBytes, stat.size),
            ),
          )
          .get()
      : undefined;
  if (previous) return true;

  db.insert(jobs)
    .values({
      mediaFileId: media.id,
      status: "queued",
      qualityProfile: config.qualityProfile,
      sourcePath: canonical,
      outputPath: outputPathFor(canonical),
      sourceSizeBytes: stat.size,
    })
    .onConflictDoNothing()
    .run();
  return true;
}

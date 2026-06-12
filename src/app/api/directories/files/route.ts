import fs from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { directories, jobs, mediaFiles } from "@/db/schema";
import { apiError } from "@/lib/api";
import { isDirectoryWatched } from "@/lib/directory-rules";
import { probeMedia, videoExtensions } from "@/lib/media";
import { canonicalMediaPath } from "@/lib/paths";
import { getSettings, isCodecEligible } from "@/lib/settings";
import { isCompressarrTemporaryFile } from "@/lib/temp-files";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("path");
    if (!requested) throw new Error("A directory path is required.");

    const directoryPath = await canonicalMediaPath(requested);
    const entries = await fs.readdir(/* turbopackIgnore: true */ directoryPath, {
      withFileTypes: true,
    });
    const directoryRules = db.select().from(directories).all();
    const watched = isDirectoryWatched(directoryPath, directoryRules);
    const config = getSettings();
    const files = [];

    for (const entry of entries
      .filter(
        (item) =>
          item.isFile() &&
          !isCompressarrTemporaryFile(item.name) &&
          videoExtensions.has(path.extname(item.name).toLowerCase()),
      )
      .sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(directoryPath, entry.name);
      const canonical = await canonicalMediaPath(candidate).catch(() => null);
      if (!canonical) continue;

      const stat = await fs.stat(canonical).catch(() => null);
      if (!stat) continue;

      const knownMedia = db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.canonicalPath, canonical))
        .get();
      const latestJob = knownMedia
        ? db
            .select()
            .from(jobs)
            .where(eq(jobs.mediaFileId, knownMedia.id))
            .orderBy(desc(jobs.createdAt))
            .get()
        : undefined;

      let codec = knownMedia?.primaryVideoCodec ?? null;
      let status: string | null = latestJob?.status ?? null;
      let detail = latestJob?.errorMessage ?? null;

      if (!watched) {
        status = "not_watched";
        detail = "This directory is not enabled.";
      } else if (!status) {
        try {
          const info = await probeMedia(canonical);
          codec = info.primaryVideoCodec;
          if (!isCodecEligible(info.primaryVideoCodec, config)) {
            status = "efficient";
            detail = `${codecLabel(info.primaryVideoCodec)} is not selected for conversion.`;
          } else {
            const ageMs = Date.now() - stat.mtimeMs;
            const minimumAgeMs =
              config.minimumFileAgeHours * 60 * 60 * 1000;
            if (ageMs < minimumAgeMs) {
              status = "waiting";
              detail = "Waiting for the minimum file age.";
            } else {
              status = "not_queued";
              detail = "Eligible, but no queue entry exists yet.";
            }
          }
        } catch (error) {
          status = "unreadable";
          detail =
            error instanceof Error ? error.message : "Unable to inspect media.";
        }
      }

      files.push({
        name: entry.name,
        path: canonical,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        codec,
        status,
        detail,
        progressPercent: latestJob?.progressPercent ?? null,
      });
    }

    return Response.json({ path: directoryPath, watched, files });
  } catch (error) {
    return apiError(error);
  }
}

function codecLabel(codec: string): string {
  const labels: Record<string, string> = {
    hevc: "H.265 / HEVC",
    h264: "H.264 / AVC",
    av1: "AV1",
    vp9: "VP9",
  };
  return labels[codec] ?? codec.toUpperCase();
}

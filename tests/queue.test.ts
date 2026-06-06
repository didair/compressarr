import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { directories, jobs, mediaFiles } from "@/db/schema";
import { claimNextJob } from "@/lib/queue";

describe("queue claims", () => {
  it("claims a queued job once", () => {
    const directory = db
      .insert(directories)
      .values({ path: `/tmp/queue-${Date.now()}`, enabled: true })
      .returning()
      .get();
    const media = db
      .insert(mediaFiles)
      .values({
        canonicalPath: `${directory.path}/video.mp4`,
        directoryId: directory.id,
        sizeBytes: 100,
        modifiedAt: new Date(),
        durationSeconds: 10,
        container: "mov,mp4",
        primaryVideoCodec: "h264",
        audioStreamCount: 1,
        subtitleStreamCount: 0,
        fingerprint: "100:1",
        lastSeenAt: new Date(),
      })
      .returning()
      .get();
    const queued = db
      .insert(jobs)
      .values({
        mediaFileId: media.id,
        qualityProfile: "balanced",
        sourcePath: media.canonicalPath,
        outputPath: `${directory.path}/video.mkv`,
        sourceSizeBytes: 100,
      })
      .returning()
      .get();

    expect(claimNextJob()?.id).toBe(queued.id);
    expect(claimNextJob()).toBeUndefined();
  });
});

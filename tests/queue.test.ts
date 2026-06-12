import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { directories, jobs, mediaFiles, remoteNodes } from "@/db/schema";
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
    const secondMedia = db
      .insert(mediaFiles)
      .values({
        canonicalPath: `${directory.path}/second.mp4`,
        directoryId: directory.id,
        sizeBytes: 200,
        modifiedAt: new Date(),
        durationSeconds: 20,
        container: "mov,mp4",
        primaryVideoCodec: "h264",
        audioStreamCount: 1,
        subtitleStreamCount: 0,
        fingerprint: "200:1",
        lastSeenAt: new Date(),
      })
      .returning()
      .get();
    const secondQueued = db
      .insert(jobs)
      .values({
        mediaFileId: secondMedia.id,
        qualityProfile: "balanced",
        sourcePath: secondMedia.canonicalPath,
        outputPath: `${directory.path}/second.mkv`,
        sourceSizeBytes: 200,
      })
      .returning()
      .get();

    expect(claimNextJob()?.id).toBe(queued.id);
    expect(claimNextJob()).toBeUndefined();
    expect(db.select().from(jobs).where(eq(jobs.id, secondQueued.id)).get()?.status)
      .toBe("queued");

    const node = db
      .insert(remoteNodes)
      .values({
        name: "test-node",
        hostname: "test-node",
        tokenHash: `test-token-${Date.now()}`,
      })
      .returning()
      .get();
    expect(() =>
      db.update(jobs)
        .set({ status: "running", remoteNodeId: node.id })
        .where(eq(jobs.id, secondQueued.id))
        .run(),
    ).not.toThrow();

    const thirdMedia = db
      .insert(mediaFiles)
      .values({
        canonicalPath: `${directory.path}/third.mp4`,
        directoryId: directory.id,
        sizeBytes: 300,
        modifiedAt: new Date(),
        durationSeconds: 30,
        container: "mov,mp4",
        primaryVideoCodec: "h264",
        audioStreamCount: 1,
        subtitleStreamCount: 0,
        fingerprint: "300:1",
        lastSeenAt: new Date(),
      })
      .returning()
      .get();
    const thirdQueued = db
      .insert(jobs)
      .values({
        mediaFileId: thirdMedia.id,
        qualityProfile: "balanced",
        sourcePath: thirdMedia.canonicalPath,
        outputPath: `${directory.path}/third.mkv`,
        sourceSizeBytes: 300,
      })
      .returning()
      .get();
    expect(() =>
      db.update(jobs)
        .set({ status: "running", remoteNodeId: node.id })
        .where(eq(jobs.id, thirdQueued.id))
        .run(),
    ).toThrow();
  });
});

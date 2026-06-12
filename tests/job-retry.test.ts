import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/jobs/[id]/retry/route";
import { db } from "@/db/client";
import { directories, jobs, mediaFiles } from "@/db/schema";

describe("manual job retry", () => {
  it.each(["failed", "skipped", "cancelled"] as const)(
    "requeues a %s job and resets execution state",
    async (status) => {
      const directory = db
        .insert(directories)
        .values({
          path: `/tmp/retry-${status}-${Date.now()}`,
          enabled: true,
        })
        .returning()
        .get();
      const media = db
        .insert(mediaFiles)
        .values({
          canonicalPath: `${directory.path}/video.mkv`,
          directoryId: directory.id,
          sizeBytes: 100,
          modifiedAt: new Date(),
          durationSeconds: 10,
          container: "matroska",
          primaryVideoCodec: "h264",
          audioStreamCount: 1,
          subtitleStreamCount: 0,
          fingerprint: "100:1",
          lastSeenAt: new Date(),
        })
        .returning()
        .get();
      const job = db
        .insert(jobs)
        .values({
          mediaFileId: media.id,
          status,
          qualityProfile: "balanced",
          sourcePath: media.canonicalPath,
          outputPath: media.canonicalPath,
          sourceSizeBytes: 100,
          outputSizeBytes: 90,
          savedBytes: 10,
          attemptCount: 3,
          completedAt: new Date(),
          cancellationRequestedAt:
            status === "cancelled" ? new Date() : null,
          errorCode: "TEST_FAILURE",
          errorMessage: "Test failure",
        })
        .returning()
        .get();

      const response = await POST(new Request("http://localhost"), {
        params: Promise.resolve({ id: String(job.id) }),
      });
      expect(response.status).toBe(200);

      const updated = db
        .select()
        .from(jobs)
        .where(eq(jobs.id, job.id))
        .get();
      expect(updated).toMatchObject({
        status: "queued",
        attemptCount: 0,
        completedAt: null,
        cancellationRequestedAt: null,
        outputSizeBytes: null,
        savedBytes: null,
        errorCode: null,
        errorMessage: null,
      });
    },
  );
});

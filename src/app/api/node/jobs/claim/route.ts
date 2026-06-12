import { randomBytes } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, remoteNodes } from "@/db/schema";
import { apiError } from "@/lib/api";
import { authenticateNode, hashSecret } from "@/lib/node-auth";
import { isJobClaimConflict } from "@/lib/queue";
import { qualityCrf, resolutionBounds } from "@/lib/ffmpeg";
import { isWithinSchedule } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  try {
    const node = authenticateNode(request);
    if (!node) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid node token." } },
        { status: 401 },
      );
    }

    const now = new Date();
    const settings = getSettings();
    if (settings.queuePaused || !isWithinSchedule(settings)) {
      db.update(remoteNodes)
        .set({ status: "idle", currentJobId: null, lastSeenAt: now })
        .where(eq(remoteNodes.id, node.id))
        .run();
      return new Response(null, { status: 204 });
    }
    const activeJob = db
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.status, "running"),
          eq(jobs.remoteNodeId, node.id),
        ),
      )
      .get();
    if (activeJob) {
      db.update(remoteNodes)
        .set({
          status: "working",
          currentJobId: activeJob.id,
          lastSeenAt: now,
        })
        .where(eq(remoteNodes.id, node.id))
        .run();
      return new Response(null, { status: 204 });
    }

    const leaseToken = randomBytes(32).toString("base64url");
    let claimed;
    try {
      claimed = db.transaction((tx) => {
        const running = tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(
            and(
              eq(jobs.status, "running"),
              eq(jobs.remoteNodeId, node.id),
            ),
          )
          .get();
        if (running) return undefined;

        const candidate = tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.status, "queued"), lte(jobs.availableAt, now)))
          .orderBy(asc(jobs.priority), asc(jobs.createdAt))
          .get();
        if (!candidate) return undefined;

        return tx
          .update(jobs)
          .set({
            status: "running",
            startedAt: now,
            workerHeartbeatAt: now,
            remoteNodeId: node.id,
            leaseTokenHash: hashSecret(leaseToken),
            leaseExpiresAt: new Date(now.getTime() + 60_000),
            attemptCount: candidate.attemptCount + 1,
            errorCode: null,
            errorMessage: null,
          })
          .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "queued")))
          .returning()
          .get();
      });
    } catch (error) {
      if (!isJobClaimConflict(error)) throw error;
    }

    db.update(remoteNodes)
      .set({
        status: claimed ? "working" : "idle",
        currentJobId: claimed?.id ?? null,
        lastSeenAt: now,
      })
      .where(eq(remoteNodes.id, node.id))
      .run();

    if (!claimed) return new Response(null, { status: 204 });

    return Response.json({
      job: {
        id: claimed.id,
        sourceName: claimed.sourcePath.split("/").pop(),
        sourceSizeBytes: claimed.sourceSizeBytes,
        durationSeconds: db.query.mediaFiles
          .findFirst({
            where: (media, { eq: equals }) =>
              equals(media.id, claimed.mediaFileId),
          })
          .sync()?.durationSeconds,
        crf: qualityCrf[claimed.qualityProfile],
        maximumResolution:
          settings.maximumResolution === "keep"
            ? null
            : resolutionBounds[settings.maximumResolution],
        minimumSavingsPercent: settings.minimumSavingsPercent,
      },
      leaseToken,
    });
  } catch (error) {
    return apiError(error);
  }
}

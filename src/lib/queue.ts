import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  directories,
  jobs,
  mediaFiles,
  remoteNodes,
  type Job,
} from "@/db/schema";
import { isPathCovered } from "./paths";

export function claimNextJob(): Job | undefined {
  return db.transaction((tx) => {
    const candidate = tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, "queued"), lte(jobs.availableAt, new Date())))
      .orderBy(asc(jobs.priority), asc(jobs.createdAt))
      .get();
    if (!candidate) return undefined;

    const claimed = tx
      .update(jobs)
      .set({
        status: "running",
        startedAt: new Date(),
        workerHeartbeatAt: new Date(),
        attemptCount: candidate.attemptCount + 1,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "queued")))
      .returning()
      .get();
    return claimed;
  });
}

export function recoverInterruptedJobs(): void {
  const stale = new Date(Date.now() - 60_000);
  const interruptedRemoteNodes = db
    .select({ id: jobs.remoteNodeId })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "running"),
        or(lte(jobs.workerHeartbeatAt, stale), isNull(jobs.workerHeartbeatAt)),
      ),
    )
    .all()
    .flatMap((row) => (row.id == null ? [] : [row.id]));
  db.update(jobs)
    .set({
      status: "queued",
      availableAt: new Date(),
      startedAt: null,
      workerHeartbeatAt: null,
      remoteNodeId: null,
      leaseTokenHash: null,
      leaseExpiresAt: null,
      errorCode: "WORKER_INTERRUPTED",
      errorMessage: "The worker stopped while this job was running.",
    })
    .where(
      and(
        eq(jobs.status, "running"),
        or(lte(jobs.workerHeartbeatAt, stale), isNull(jobs.workerHeartbeatAt)),
      ),
    )
    .run();
  for (const nodeId of interruptedRemoteNodes) {
    db.update(remoteNodes)
      .set({ status: "offline", currentJobId: null })
      .where(eq(remoteNodes.id, nodeId))
      .run();
  }
}

export function cancelUncoveredQueuedJobs(disabledPath: string): void {
  const enabled = db
    .select()
    .from(directories)
    .where(eq(directories.enabled, true))
    .all();
  const pending = db
    .select({ job: jobs, media: mediaFiles })
    .from(jobs)
    .innerJoin(mediaFiles, eq(jobs.mediaFileId, mediaFiles.id))
    .where(inArray(jobs.status, ["queued"]))
    .all();

  for (const { job, media } of pending) {
    if (
      isPathCovered(media.canonicalPath, disabledPath) &&
      !enabled.some((item) => isPathCovered(media.canonicalPath, item.path))
    ) {
      db.update(jobs)
        .set({
          status: "cancelled",
          completedAt: new Date(),
          errorCode: "DIRECTORY_DISABLED",
          errorMessage: "The containing media directory was disabled.",
        })
        .where(eq(jobs.id, job.id))
        .run();
    }
  }
}

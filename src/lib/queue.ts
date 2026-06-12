import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  directories,
  jobs,
  mediaFiles,
  remoteNodes,
  type Job,
} from "@/db/schema";
import { isDirectoryWatched } from "./directory-rules";
import { isPathCovered } from "./paths";

export function claimNextJob(): Job | undefined {
  try {
    return db.transaction((tx) => {
      const running = tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.status, "running"), isNull(jobs.remoteNodeId)))
        .get();
      if (running) return undefined;

      const candidate = tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, "queued"), lte(jobs.availableAt, new Date())))
        .orderBy(asc(jobs.priority), asc(jobs.createdAt))
        .get();
      if (!candidate) return undefined;

      return tx
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
    });
  } catch (error) {
    if (isJobClaimConflict(error)) return undefined;
    throw error;
  }
}

export function isJobClaimConflict(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  if (typeof error.code === "string" && error.code.startsWith("SQLITE_BUSY")) {
    return true;
  }
  return (
    error.code === "SQLITE_CONSTRAINT_UNIQUE" &&
    (error.message.includes("jobs_one_running_local_idx") ||
      error.message.includes("jobs_one_running_remote_node_idx"))
  );
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
  const rules = db.select().from(directories).all();
  const pending = db
    .select({ job: jobs, media: mediaFiles })
    .from(jobs)
    .innerJoin(mediaFiles, eq(jobs.mediaFileId, mediaFiles.id))
    .where(inArray(jobs.status, ["queued"]))
    .all();

  for (const { job, media } of pending) {
    if (
      isPathCovered(media.canonicalPath, disabledPath) &&
      !isDirectoryWatched(media.canonicalPath, rules)
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

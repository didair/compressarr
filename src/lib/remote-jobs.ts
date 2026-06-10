import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, remoteNodes } from "@/db/schema";
import { authenticateNode, hashSecret } from "./node-auth";

export function authenticateLeasedJob(
  request: Request,
  jobId: number,
) {
  const node = authenticateNode(request);
  const leaseToken = request.headers.get("x-compressarr-lease");
  if (!node || !leaseToken) return null;

  const job = db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.status, "running"),
        eq(jobs.remoteNodeId, node.id),
        eq(jobs.leaseTokenHash, hashSecret(leaseToken)),
      ),
    )
    .get();
  return job ? { node, job } : null;
}

export function heartbeatRemoteJob(nodeId: number, jobId: number): void {
  const now = new Date();
  db.update(jobs)
    .set({
      workerHeartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    })
    .where(eq(jobs.id, jobId))
    .run();
  db.update(remoteNodes)
    .set({ status: "working", currentJobId: jobId, lastSeenAt: now })
    .where(eq(remoteNodes.id, nodeId))
    .run();
}

export function releaseRemoteNode(nodeId: number): void {
  db.update(remoteNodes)
    .set({ status: "idle", currentJobId: null, lastSeenAt: new Date() })
    .where(eq(remoteNodes.id, nodeId))
    .run();
}

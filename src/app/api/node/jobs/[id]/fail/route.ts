import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError } from "@/lib/api";
import {
  authenticateLeasedJob,
  releaseRemoteNode,
} from "@/lib/remote-jobs";
import { getSettings } from "@/lib/settings";

const failureSchema = z.object({
  code: z.string().max(100).default("REMOTE_NODE_FAILED"),
  message: z.string().max(16_000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const lease = authenticateLeasedJob(request, id);
    if (!lease) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid job lease." } },
        { status: 401 },
      );
    }
    const failure = failureSchema.parse(await request.json());
    const current = db.select().from(jobs).where(eq(jobs.id, id)).get();
    const cancelled = Boolean(current?.cancellationRequestedAt);
    const retry =
      !cancelled &&
      current &&
      current.attemptCount < getSettings().automaticRetryCount + 1;
    db.update(jobs)
      .set({
        status: cancelled ? "cancelled" : retry ? "queued" : "failed",
        completedAt: retry ? null : new Date(),
        availableAt: retry
          ? new Date(
              Date.now() +
                2 ** Math.max(0, (current?.attemptCount ?? 1) - 1) * 60_000,
            )
          : current?.availableAt,
        errorCode: cancelled ? "CANCELLED_BY_USER" : failure.code,
        errorMessage: cancelled ? "Cancelled by user." : failure.message,
        remoteNodeId: retry ? null : lease.node.id,
        workerHeartbeatAt: null,
        leaseExpiresAt: null,
        leaseTokenHash: null,
      })
      .where(eq(jobs.id, id))
      .run();
    releaseRemoteNode(lease.node.id);
    return Response.json({
      accepted: true,
      status: cancelled ? "cancelled" : retry ? "queued" : "failed",
    });
  } catch (error) {
    return apiError(error);
  }
}

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError, notFound } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const updated = db
      .update(jobs)
      .set({
        status: "queued",
        availableAt: new Date(),
        attemptCount: 0,
        startedAt: null,
        completedAt: null,
        cancellationRequestedAt: null,
        workerHeartbeatAt: null,
        remoteNodeId: null,
        leaseTokenHash: null,
        leaseExpiresAt: null,
        progressPercent: null,
        speed: null,
        etaSeconds: null,
        outputSizeBytes: null,
        savedBytes: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(
        and(
          eq(jobs.id, id),
          inArray(jobs.status, ["failed", "skipped", "cancelled"]),
        ),
      )
      .returning()
      .get();
    if (!updated) return notFound("Recoverable job not found.");
    return Response.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

import { and, eq } from "drizzle-orm";
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
        completedAt: null,
        cancellationRequestedAt: null,
        progressPercent: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(and(eq(jobs.id, id), eq(jobs.status, "failed")))
      .returning()
      .get();
    if (!updated) return notFound("Failed job not found.");
    return Response.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

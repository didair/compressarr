import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError, notFound } from "@/lib/api";
import { cleanupTemporaryFilesForSource } from "@/lib/temp-files";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const current = db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, id), inArray(jobs.status, ["queued", "running"])))
      .get();
    if (!current) return notFound("Active job not found.");
    const updated = db
      .update(jobs)
      .set(
        current.status === "queued"
          ? {
              status: "cancelled",
              completedAt: new Date(),
              errorCode: "CANCELLED_BY_USER",
              errorMessage: "Cancelled by user.",
            }
          : { cancellationRequestedAt: new Date() },
      )
      .where(eq(jobs.id, id))
      .returning()
      .get();
    if (current.status === "queued") {
      await cleanupTemporaryFilesForSource(current.sourcePath);
    }
    return Response.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

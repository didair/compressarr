import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError, notFound } from "@/lib/api";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const deleted = db
      .delete(jobs)
      .where(
        and(
          eq(jobs.id, id),
          inArray(jobs.status, ["completed", "failed", "skipped", "cancelled"]),
        ),
      )
      .returning({ id: jobs.id })
      .get();
    if (!deleted) return notFound("Finished job not found.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}

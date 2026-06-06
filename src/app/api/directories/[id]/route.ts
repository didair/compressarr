import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { apiError, notFound } from "@/lib/api";
import { cancelUncoveredQueuedJobs } from "@/lib/queue";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const body = z.object({ enabled: z.boolean() }).parse(await request.json());
    const current = db
      .select()
      .from(directories)
      .where(eq(directories.id, id))
      .get();
    if (!current) return notFound("Directory not found.");

    const updated = db
      .update(directories)
      .set({
        enabled: body.enabled,
        scanRequestedAt: body.enabled ? new Date() : null,
      })
      .where(eq(directories.id, id))
      .returning()
      .get();
    if (!body.enabled) cancelUncoveredQueuedJobs(current.path);
    return Response.json(updated);
  } catch (error) {
    return apiError(error);
  }
}

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { apiError, notFound } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const updated = db
      .update(directories)
      .set({ scanRequestedAt: new Date() })
      .where(and(eq(directories.id, id), eq(directories.enabled, true)))
      .returning({ id: directories.id })
      .get();
    if (!updated) return notFound("Enabled directory not found.");
    return Response.json({ requested: true });
  } catch (error) {
    return apiError(error);
  }
}

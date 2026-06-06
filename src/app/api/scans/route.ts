import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { apiError } from "@/lib/api";

export async function POST() {
  try {
    const now = new Date();
    const changed = db
      .update(directories)
      .set({ scanRequestedAt: now })
      .where(eq(directories.enabled, true))
      .returning({ id: directories.id })
      .all();
    return Response.json({ requested: changed.length });
  } catch (error) {
    return apiError(error);
  }
}

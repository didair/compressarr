import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const counts = db
      .select({
        status: jobs.status,
        count: sql<number>`count(*)`,
      })
      .from(jobs)
      .groupBy(jobs.status)
      .all();
    const totals = db
      .select({
        savedBytes: sql<number>`coalesce(sum(${jobs.savedBytes}), 0)`,
        completed: sql<number>`count(*)`,
      })
      .from(jobs)
      .where(eq(jobs.status, "completed"))
      .get();
    const current = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "running"))
      .orderBy(desc(jobs.startedAt))
      .all();
    const recent = db
      .select()
      .from(jobs)
      .where(sql`${jobs.status} in ('completed', 'failed', 'skipped')`)
      .orderBy(desc(jobs.completedAt))
      .limit(8)
      .all();
    const failed = db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "failed"))
      .orderBy(desc(jobs.completedAt))
      .limit(5)
      .all();

    return Response.json({
      counts: Object.fromEntries(counts.map((row) => [row.status, row.count])),
      savedBytes: totals?.savedBytes ?? 0,
      completedCount: totals?.completed ?? 0,
      current,
      recent,
      failed,
      queuePaused: getSettings().queuePaused,
    });
  } catch (error) {
    return apiError(error);
  }
}

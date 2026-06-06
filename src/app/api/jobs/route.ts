import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs, jobStatuses } from "@/db/schema";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = z.coerce.number().int().min(1).catch(1).parse(params.get("page"));
    const pageSize = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .catch(25)
      .parse(params.get("pageSize"));
    const statusValue = params.get("status");
    const status = statusValue
      ? z.enum(jobStatuses).parse(statusValue)
      : undefined;
    const filters: SQL[] = [];
    if (status) filters.push(eq(jobs.status, status));
    const where = filters.length ? and(...filters) : undefined;

    const items = db
      .select()
      .from(jobs)
      .where(where)
      .orderBy(desc(jobs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .all();
    const total = db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(where)
      .get()?.count;
    return Response.json({ items, total: total ?? 0, page, pageSize });
  } catch (error) {
    return apiError(error);
  }
}

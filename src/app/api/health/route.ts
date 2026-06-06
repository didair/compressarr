import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { apiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    db.run(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (error) {
    return apiError(error);
  }
}

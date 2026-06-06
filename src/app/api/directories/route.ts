import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { directories, mediaFiles } from "@/db/schema";
import { apiError } from "@/lib/api";
import { canonicalMediaPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = db
      .select({
        id: directories.id,
        path: directories.path,
        enabled: directories.enabled,
        scanRequestedAt: directories.scanRequestedAt,
        lastScanStartedAt: directories.lastScanStartedAt,
        lastScanCompletedAt: directories.lastScanCompletedAt,
        lastScanError: directories.lastScanError,
        createdAt: directories.createdAt,
        updatedAt: directories.updatedAt,
        discoveredCount: sql<number>`count(${mediaFiles.id})`,
      })
      .from(directories)
      .leftJoin(mediaFiles, eq(mediaFiles.directoryId, directories.id))
      .groupBy(directories.id)
      .orderBy(asc(directories.path))
      .all();
    return Response.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = z.object({ path: z.string().min(1) }).parse(await request.json());
    const canonical = await canonicalMediaPath(body.path);
    const directory = db
      .insert(directories)
      .values({ path: canonical, enabled: true, scanRequestedAt: new Date() })
      .onConflictDoUpdate({
        target: directories.path,
        set: { enabled: true, scanRequestedAt: new Date() },
      })
      .returning()
      .get();
    return Response.json(directory, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

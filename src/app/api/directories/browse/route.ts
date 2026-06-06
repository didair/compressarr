import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { apiError } from "@/lib/api";
import { canonicalMediaPath, isPathCovered, mediaRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("path") ?? mediaRoot;
    const canonical = await canonicalMediaPath(requested);
    const entries = await fs.readdir(/* turbopackIgnore: true */ canonical, {
      withFileTypes: true,
    });
    const enabled = db
      .select()
      .from(directories)
      .where(eq(directories.enabled, true))
      .all();
    const children = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => {
          const candidate = path.join(canonical, entry.name);
          const resolved = await canonicalMediaPath(candidate).catch(() => null);
          if (!resolved) return null;
          const exact = enabled.find((item) => item.path === resolved);
          const covering = enabled.find((item) => isPathCovered(resolved, item.path));
          return {
            name: entry.name,
            path: resolved,
            enabled: Boolean(exact),
            coveredBy: covering?.path ?? null,
          };
        }),
    );
    const root = await fs.realpath(/* turbopackIgnore: true */ mediaRoot);
    return Response.json({
      path: canonical,
      parent: canonical === root ? null : path.dirname(canonical),
      entries: children.filter(Boolean),
    });
  } catch (error) {
    return apiError(error);
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { apiError } from "@/lib/api";
import { videoExtensions } from "@/lib/media";
import { canonicalMediaPath, isPathCovered, mediaRoot } from "@/lib/paths";

export const dynamic = "force-dynamic";

interface DirectoryStats {
  sizeBytes: number;
  mediaFileCount: number;
  hasSubdirectories: boolean;
}

const statsCache = new Map<
  string,
  DirectoryStats & { expiresAt: number }
>();
const sizeCacheDurationMs = 30_000;

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("path") ?? mediaRoot;
    const canonical = await canonicalMediaPath(requested);
    const entries = await fs.readdir(/* turbopackIgnore: true */ canonical, {
      withFileTypes: true,
    });
    const managed = db.select().from(directories).all();
    const enabled = managed
      .filter((directory) => directory.enabled)
      .sort((left, right) => right.path.length - left.path.length);
    const children = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(async (entry) => {
          const candidate = path.join(canonical, entry.name);
          const resolved = await canonicalMediaPath(candidate).catch(() => null);
          if (!resolved) return null;
          return describeDirectory(resolved, entry.name, managed, enabled);
        }),
    );
    const root = await fs.realpath(/* turbopackIgnore: true */ mediaRoot);
    return Response.json({
      path: canonical,
      parent: canonical === root ? null : path.dirname(canonical),
      node: await describeDirectory(
        canonical,
        canonical === root ? path.basename(root) || root : path.basename(canonical),
        managed,
        enabled,
      ),
      entries: children.filter(Boolean),
    });
  } catch (error) {
    return apiError(error);
  }
}

async function describeDirectory(
  directoryPath: string,
  name: string,
  managed: typeof directories.$inferSelect[],
  enabled: typeof directories.$inferSelect[],
) {
  const exact = managed.find((directory) => directory.path === directoryPath);
  const covering = enabled.find(
    (directory) =>
      directory.path !== directoryPath &&
      isPathCovered(directoryPath, directory.path),
  );

  const stats = await getDirectoryStats(directoryPath);
  return {
    name,
    path: directoryPath,
    directoryId: exact?.id ?? null,
    enabled: exact?.enabled ?? false,
    coveredBy: covering?.path ?? null,
    ...stats,
  };
}

async function getDirectoryStats(directoryPath: string): Promise<DirectoryStats> {
  const cached = statsCache.get(directoryPath);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      sizeBytes: cached.sizeBytes,
      mediaFileCount: cached.mediaFileCount,
      hasSubdirectories: cached.hasSubdirectories,
    };
  }

  let sizeBytes = 0;
  let mediaFileCount = 0;
  let hasSubdirectories = false;
  let handle;
  try {
    handle = await fs.opendir(/* turbopackIgnore: true */ directoryPath);
  } catch {
    return { sizeBytes, mediaFileCount, hasSubdirectories };
  }

  for await (const entry of handle) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      hasSubdirectories = true;
      const childStats = await getDirectoryStats(entryPath);
      sizeBytes += childStats.sizeBytes;
      mediaFileCount += childStats.mediaFileCount;
    } else if (entry.isFile()) {
      const stat = await fs
        .stat(/* turbopackIgnore: true */ entryPath)
        .catch(() => null);
      if (stat) sizeBytes += stat.size;
      if (videoExtensions.has(path.extname(entry.name).toLowerCase())) {
        mediaFileCount += 1;
      }
    }
  }

  statsCache.set(directoryPath, {
    sizeBytes,
    mediaFileCount,
    hasSubdirectories,
    expiresAt: Date.now() + sizeCacheDurationMs,
  });
  return { sizeBytes, mediaFileCount, hasSubdirectories };
}

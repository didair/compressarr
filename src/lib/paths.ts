import fs from "node:fs/promises";
import path from "node:path";

export const mediaRoot = process.env.MEDIA_ROOT ?? "/media";

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function canonicalMediaPath(candidate: string): Promise<string> {
  const root = await fs.realpath(/* turbopackIgnore: true */ mediaRoot);
  const requested = path.isAbsolute(candidate)
    ? candidate
    : path.resolve(root, candidate);
  const canonical = await fs.realpath(/* turbopackIgnore: true */ requested);

  if (!isWithin(root, canonical)) {
    throw new PathSecurityError("Path is outside the configured media root.");
  }
  return canonical;
}

export function isPathCovered(candidate: string, parent: string): boolean {
  return isWithin(parent, candidate);
}

export class PathSecurityError extends Error {
  readonly code = "PATH_OUTSIDE_MEDIA_ROOT";
}

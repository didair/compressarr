import type { Directory } from "@/db/schema";
import { isPathCovered } from "./paths";

export function controllingDirectory(
  candidate: string,
  rules: Directory[],
): Directory | undefined {
  return rules
    .filter((rule) => isPathCovered(candidate, rule.path))
    .sort((left, right) => right.path.length - left.path.length)[0];
}

export function isDirectoryWatched(
  candidate: string,
  rules: Directory[],
): boolean {
  return controllingDirectory(candidate, rules)?.enabled ?? false;
}

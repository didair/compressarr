import { describe, expect, it } from "vitest";
import type { Directory } from "@/db/schema";
import {
  controllingDirectory,
  isDirectoryWatched,
} from "@/lib/directory-rules";

function rule(path: string, enabled: boolean, id: number): Directory {
  const now = new Date();
  return {
    id,
    path,
    enabled,
    scanRequestedAt: null,
    lastScanStartedAt: null,
    lastScanCompletedAt: null,
    lastScanError: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("directory rules", () => {
  const rules = [
    rule("/media/DAVE", true, 1),
    rule("/media/DAVE/Season 2", false, 2),
    rule("/media/DAVE/Season 2/Specials", true, 3),
  ];

  it("inherits an enabled parent", () => {
    expect(isDirectoryWatched("/media/DAVE/Season 1", rules)).toBe(true);
  });

  it("allows a disabled child to override an enabled parent", () => {
    expect(isDirectoryWatched("/media/DAVE/Season 2/episode.mkv", rules)).toBe(
      false,
    );
  });

  it("uses the nearest explicit rule", () => {
    expect(
      controllingDirectory("/media/DAVE/Season 2/Specials/file.mkv", rules)?.id,
    ).toBe(3);
    expect(
      isDirectoryWatched("/media/DAVE/Season 2/Specials/file.mkv", rules),
    ).toBe(true);
  });
});

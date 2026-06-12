import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  cleanupTemporaryFilesForSource,
  isCompressarrTemporaryFile,
} from "@/lib/temp-files";

describe("Compressarr temporary files", () => {
  it("recognizes generated temporary output names", () => {
    expect(
      isCompressarrTemporaryFile(
        ".episode.mkv.compressarr-48.tmp.mkv",
      ),
    ).toBe(true);
    expect(
      isCompressarrTemporaryFile(
        ".episode.mkv.compressarr-remote-12.tmp.mkv",
      ),
    ).toBe(true);
    expect(isCompressarrTemporaryFile("episode.mkv")).toBe(false);
  });

  it("removes only temporary files belonging to the source", async () => {
    const directory = await fs.mkdtemp("/tmp/compressarr-temp-files-");
    const source = path.join(directory, "episode.mkv");
    const stale = path.join(
      directory,
      ".episode.mkv.compressarr-48.tmp.mkv",
    );
    const unrelated = path.join(
      directory,
      ".other.mkv.compressarr-48.tmp.mkv",
    );
    await Promise.all([
      fs.writeFile(source, ""),
      fs.writeFile(stale, ""),
      fs.writeFile(unrelated, ""),
    ]);

    await cleanupTemporaryFilesForSource(source);

    await expect(fs.access(stale)).rejects.toThrow();
    await expect(fs.access(unrelated)).resolves.toBeUndefined();
    await fs.rm(directory, { recursive: true, force: true });
  });
});

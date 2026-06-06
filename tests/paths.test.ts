import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canonicalMediaPath, mediaRoot } from "@/lib/paths";

describe("media path security", () => {
  it("accepts paths within the media root", async () => {
    const child = path.join(mediaRoot, "series");
    await fs.mkdir(child, { recursive: true });
    await expect(canonicalMediaPath(child)).resolves.toBe(await fs.realpath(child));
  });

  it("rejects symlinks escaping the media root", async () => {
    const link = path.join(mediaRoot, "escape");
    await fs.rm(link, { force: true });
    await fs.symlink("/tmp", link);
    await expect(canonicalMediaPath(link)).rejects.toMatchObject({
      code: "PATH_OUTSIDE_MEDIA_ROOT",
    });
  });
});

import fs from "node:fs/promises";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { directories } from "@/db/schema";
import { scanDirectory } from "@/lib/scanner";

describe("directory scanning", () => {
  it("disables a watched directory when it no longer exists", async () => {
    const path = await fs.mkdtemp("/tmp/compressarr-missing-directory-");
    const directory = db
      .insert(directories)
      .values({ path, enabled: true })
      .returning()
      .get();
    await fs.rm(path, { recursive: true });

    await expect(scanDirectory(directory)).resolves.toBe(0);

    const updated = db
      .select()
      .from(directories)
      .where(eq(directories.id, directory.id))
      .get();
    expect(updated?.enabled).toBe(false);
    expect(updated?.lastScanError).toContain("automatically disabled");
  });
});

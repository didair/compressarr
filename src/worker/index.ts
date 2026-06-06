import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, sqlite } from "@/db/client";
import { directories } from "@/db/schema";
import { claimNextJob, recoverInterruptedJobs } from "@/lib/queue";
import { processJob } from "@/lib/processor";
import { scanDirectory } from "@/lib/scanner";
import { isWithinSchedule } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";

let stopping = false;

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function main(): Promise<void> {
  recoverInterruptedJobs();
  await cleanupTemporaryFiles();
  console.log("Compressarr worker started.");

  while (!stopping) {
    try {
      await fs.writeFile("/tmp/compressarr-worker-health", String(Date.now()));
      await runDueScan();
      const config = getSettings();
      if (!config.queuePaused && isWithinSchedule(config)) {
        const job = claimNextJob();
        if (job) {
          await processJob(job);
          continue;
        }
      }
    } catch (error) {
      console.error("Worker iteration failed:", error);
    }
    await sleep(2_000);
  }

  sqlite.close();
  console.log("Compressarr worker stopped.");
}

async function runDueScan(): Promise<void> {
  const config = getSettings();
  const dueBefore = new Date(Date.now() - config.scanIntervalMinutes * 60_000);
  const directory = db
    .select()
    .from(directories)
    .where(
      and(
        eq(directories.enabled, true),
        or(
          lte(directories.lastScanCompletedAt, dueBefore),
          isNull(directories.lastScanCompletedAt),
          lte(directories.scanRequestedAt, new Date()),
        ),
      ),
    )
    .get();
  if (directory) await scanDirectory(directory);
}

async function cleanupTemporaryFiles(): Promise<void> {
  const enabled = db
    .select()
    .from(directories)
    .where(eq(directories.enabled, true))
    .all();
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const directory of enabled) {
    await cleanup(directory.path, cutoff);
  }
}

async function cleanup(root: string, cutoff: number): Promise<void> {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.name.includes(".compressarr-") && entry.name.endsWith(".tmp.mkv")) {
        const stat = await fs.stat(candidate).catch(() => null);
        if (stat && stat.mtimeMs < cutoff) await fs.rm(candidate, { force: true });
      }
    }
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

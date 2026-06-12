import fs from "node:fs/promises";
import path from "node:path";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db, sqlite } from "@/db/client";
import { directories, jobs } from "@/db/schema";
import { claimNextJob, recoverInterruptedJobs } from "@/lib/queue";
import { processJob } from "@/lib/processor";
import { scanDirectory } from "@/lib/scanner";
import { isWithinSchedule } from "@/lib/schedule";
import { getSettings } from "@/lib/settings";

let stopping = false;
let lastRecoveryAt = 0;

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function main(): Promise<void> {
  recoverInterruptedJobs();
  await disableMissingDirectories();
  await cleanupTemporaryFiles();
  console.log("Compressarr worker started.");

  while (!stopping) {
    try {
      await fs.writeFile("/tmp/compressarr-worker-health", String(Date.now()));
      if (Date.now() - lastRecoveryAt > 30_000) {
        recoverInterruptedJobs();
        lastRecoveryAt = Date.now();
      }
      await runDueScan();
      const config = getSettings();
      if (!config.queuePaused && isWithinSchedule(config)) {
        const job = claimNextJob();
        if (job) {
          console.log(`Starting job ${job.id}: ${path.basename(job.sourcePath)}`);
          await processJob(job);
          const result = db
            .select({
              status: jobs.status,
              savedBytes: jobs.savedBytes,
              errorMessage: jobs.errorMessage,
            })
            .from(jobs)
            .where(eq(jobs.id, job.id))
            .get();
          const detail =
            result?.status === "completed"
              ? `, saved ${formatBytes(result.savedBytes ?? 0)}`
              : result?.errorMessage
                ? `: ${result.errorMessage}`
                : "";
          console.log(`Finished job ${job.id} (${result?.status ?? "unknown"})${detail}`);
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

async function disableMissingDirectories(): Promise<void> {
  const enabled = db
    .select()
    .from(directories)
    .where(eq(directories.enabled, true))
    .all();

  for (const directory of enabled) {
    try {
      await fs.access(directory.path);
    } catch (error) {
      if (!isMissingPathError(error)) continue;
      db.update(directories)
        .set({
          enabled: false,
          scanRequestedAt: null,
          lastScanCompletedAt: new Date(),
          lastScanError:
            "Directory no longer exists and was automatically disabled.",
        })
        .where(eq(directories.id, directory.id))
        .run();
      console.warn(`Disabled missing media directory: ${directory.path}`);
    }
  }
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

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (Math.abs(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

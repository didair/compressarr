import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const directories = sqliteTable(
  "directories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    path: text("path").notNull().unique(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    scanRequestedAt: integer("scan_requested_at", { mode: "timestamp_ms" }),
    lastScanStartedAt: integer("last_scan_started_at", { mode: "timestamp_ms" }),
    lastScanCompletedAt: integer("last_scan_completed_at", {
      mode: "timestamp_ms",
    }),
    lastScanError: text("last_scan_error"),
    ...timestamps,
  },
  (table) => [index("directories_enabled_idx").on(table.enabled)],
);

export const mediaFiles = sqliteTable(
  "media_files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    canonicalPath: text("canonical_path").notNull().unique(),
    directoryId: integer("directory_id")
      .notNull()
      .references(() => directories.id, { onDelete: "cascade" }),
    sizeBytes: integer("size_bytes").notNull(),
    modifiedAt: integer("modified_at", { mode: "timestamp_ms" }).notNull(),
    durationSeconds: real("duration_seconds").notNull(),
    container: text("container").notNull(),
    primaryVideoCodec: text("primary_video_codec").notNull(),
    audioStreamCount: integer("audio_stream_count").notNull(),
    subtitleStreamCount: integer("subtitle_stream_count").notNull(),
    fingerprint: text("fingerprint").notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("media_files_directory_idx").on(table.directoryId),
    index("media_files_fingerprint_idx").on(table.fingerprint),
  ],
);

export const jobStatuses = [
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const qualityProfiles = ["high", "balanced", "compact"] as const;
export type QualityProfile = (typeof qualityProfiles)[number];

export const remoteNodes = sqliteTable(
  "remote_nodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    hostname: text("hostname").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    version: text("version"),
    status: text("status").notNull().default("offline"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    currentJobId: integer("current_job_id"),
    ...timestamps,
  },
  (table) => [index("remote_nodes_last_seen_idx").on(table.lastSeenAt)],
);

export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mediaFileId: integer("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    status: text("status", { enum: jobStatuses }).notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    qualityProfile: text("quality_profile", { enum: qualityProfiles }).notNull(),
    sourcePath: text("source_path").notNull(),
    outputPath: text("output_path").notNull(),
    sourceSizeBytes: integer("source_size_bytes").notNull(),
    outputSizeBytes: integer("output_size_bytes"),
    savedBytes: integer("saved_bytes"),
    progressPercent: real("progress_percent"),
    speed: text("speed"),
    etaSeconds: integer("eta_seconds"),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: integer("available_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    cancellationRequestedAt: integer("cancellation_requested_at", {
      mode: "timestamp_ms",
    }),
    workerHeartbeatAt: integer("worker_heartbeat_at", {
      mode: "timestamp_ms",
    }),
    remoteNodeId: integer("remote_node_id").references(() => remoteNodes.id, {
      onDelete: "set null",
    }),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    index("jobs_status_available_idx").on(table.status, table.availableAt),
    index("jobs_created_idx").on(table.createdAt),
    index("jobs_remote_node_idx").on(table.remoteNodeId),
    uniqueIndex("jobs_one_active_media_idx")
      .on(table.mediaFileId)
      .where(sql`${table.status} in ('queued', 'running')`),
    uniqueIndex("jobs_one_running_local_idx")
      .on(sql`1`)
      .where(sql`${table.status} = 'running' and ${table.remoteNodeId} is null`),
    uniqueIndex("jobs_one_running_remote_node_idx")
      .on(table.remoteNodeId)
      .where(sql`${table.status} = 'running' and ${table.remoteNodeId} is not null`),
  ],
);

export type Directory = typeof directories.$inferSelect;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type RemoteNode = typeof remoteNodes.$inferSelect;

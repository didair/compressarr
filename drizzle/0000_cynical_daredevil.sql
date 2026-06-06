CREATE TABLE `directories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`scan_requested_at` integer,
	`last_scan_started_at` integer,
	`last_scan_completed_at` integer,
	`last_scan_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `directories_path_unique` ON `directories` (`path`);--> statement-breakpoint
CREATE INDEX `directories_enabled_idx` ON `directories` (`enabled`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`media_file_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`quality_profile` text NOT NULL,
	`source_path` text NOT NULL,
	`output_path` text NOT NULL,
	`source_size_bytes` integer NOT NULL,
	`output_size_bytes` integer,
	`saved_bytes` integer,
	`progress_percent` real,
	`speed` text,
	`eta_seconds` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`cancellation_requested_at` integer,
	`worker_heartbeat_at` integer,
	`started_at` integer,
	`completed_at` integer,
	`error_code` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`media_file_id`) REFERENCES `media_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_available_idx` ON `jobs` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `jobs_created_idx` ON `jobs` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_active_media_idx` ON `jobs` (`media_file_id`) WHERE "jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE TABLE `media_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`canonical_path` text NOT NULL,
	`directory_id` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`modified_at` integer NOT NULL,
	`duration_seconds` real NOT NULL,
	`container` text NOT NULL,
	`primary_video_codec` text NOT NULL,
	`audio_stream_count` integer NOT NULL,
	`subtitle_stream_count` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`directory_id`) REFERENCES `directories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_files_canonical_path_unique` ON `media_files` (`canonical_path`);--> statement-breakpoint
CREATE INDEX `media_files_directory_idx` ON `media_files` (`directory_id`);--> statement-breakpoint
CREATE INDEX `media_files_fingerprint_idx` ON `media_files` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);

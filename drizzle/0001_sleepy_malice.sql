CREATE TABLE `remote_nodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`hostname` text NOT NULL,
	`token_hash` text NOT NULL,
	`version` text,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_seen_at` integer,
	`current_job_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `remote_nodes_token_hash_unique` ON `remote_nodes` (`token_hash`);--> statement-breakpoint
CREATE INDEX `remote_nodes_last_seen_idx` ON `remote_nodes` (`last_seen_at`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `remote_node_id` integer REFERENCES remote_nodes(id);--> statement-breakpoint
ALTER TABLE `jobs` ADD `lease_token_hash` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `lease_expires_at` integer;--> statement-breakpoint
CREATE INDEX `jobs_remote_node_idx` ON `jobs` (`remote_node_id`);
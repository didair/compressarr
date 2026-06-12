DROP INDEX `jobs_one_running_global_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_running_local_idx` ON `jobs` (1) WHERE "jobs"."status" = 'running' and "jobs"."remote_node_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_running_remote_node_idx` ON `jobs` (`remote_node_id`) WHERE "jobs"."status" = 'running' and "jobs"."remote_node_id" is not null;
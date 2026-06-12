UPDATE `jobs`
SET
  `status` = 'queued',
  `available_at` = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER),
  `started_at` = NULL,
  `worker_heartbeat_at` = NULL,
  `remote_node_id` = NULL,
  `lease_token_hash` = NULL,
  `lease_expires_at` = NULL,
  `progress_percent` = NULL,
  `speed` = NULL,
  `eta_seconds` = NULL,
  `error_code` = 'CONCURRENCY_RECONCILED',
  `error_message` = 'Returned to the queue while enforcing the single conversion limit.'
WHERE
  `status` = 'running'
  AND `id` NOT IN (
    SELECT `id`
    FROM `jobs`
    WHERE `status` = 'running'
    ORDER BY `started_at` ASC, `id` ASC
    LIMIT 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_one_running_global_idx` ON `jobs` (1) WHERE "jobs"."status" = 'running';

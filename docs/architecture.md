# Architecture

Compressarr ships one image with two processes. The Next.js process owns the web UI and API; the worker owns directory scanning and FFmpeg execution. Both coordinate through a SQLite database in WAL mode.

The scanner canonicalizes all filesystem paths beneath the configured media root, probes candidate files, upserts media metadata, and creates deduplicated jobs. The worker transactionally claims one job, encodes to a temporary file beside the source, validates the result, and then performs replacement.

Settings use a typed JSON key/value table. Queue actions, scan requests, cancellation, progress, and recovery state are persisted so container restarts do not depend on in-memory state.

Database schema changes use committed Drizzle migrations. The web container applies migrations before accepting traffic.

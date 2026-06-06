import fs from "node:fs";
import path from "node:path";

const suffix = `${process.pid}`;
process.env.DATABASE_PATH = path.join("/tmp", `compressarr-test-${suffix}.sqlite`);
process.env.MEDIA_ROOT = path.join("/tmp", `compressarr-media-${suffix}`);
fs.mkdirSync(process.env.MEDIA_ROOT, { recursive: true });

const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { db } = await import("@/db/client");
migrate(db, { migrationsFolder: path.resolve("drizzle") });

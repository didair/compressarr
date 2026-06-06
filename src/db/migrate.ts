import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "./client";

const migrationsFolder =
  process.env.MIGRATIONS_PATH ?? path.resolve(process.cwd(), "drizzle");

migrate(db, { migrationsFolder });
sqlite.close();
console.log("Database migrations applied.");

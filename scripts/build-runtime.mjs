import fs from "node:fs/promises";
import { build } from "esbuild";

const outputDirectory = "runtime";

await fs.rm(outputDirectory, { recursive: true, force: true });
await fs.mkdir(outputDirectory, { recursive: true });

const shared = {
  bundle: true,
  external: ["better-sqlite3"],
  format: "cjs",
  platform: "node",
  target: "node24",
};

await Promise.all([
  build({
    ...shared,
    entryPoints: ["src/worker/index.ts"],
    outfile: `${outputDirectory}/worker.cjs`,
  }),
  build({
    ...shared,
    entryPoints: ["src/db/migrate.ts"],
    outfile: `${outputDirectory}/migrate.cjs`,
  }),
]);

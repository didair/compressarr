import { execFileSync } from "node:child_process";
import fs from "node:fs";

const repository = "docker.io/didair/compressarr";
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const version = packageJson.version;
const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(version);

if (!match) {
  throw new Error(`package.json contains an invalid semantic version: ${version}`);
}

const majorMinor = `${match[1]}.${match[2]}`;
const revision = execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
  encoding: "utf8",
}).trim();
const tags = [
  `${repository}:${version}`,
  `${repository}:${majorMinor}`,
  `${repository}:latest`,
  `${repository}:sha-${revision}`,
];
const args = [
  "buildx",
  "build",
  "--platform",
  process.env.DOCKER_PLATFORMS ?? "linux/amd64,linux/arm64",
  "--build-arg",
  `VERSION=${version}`,
  "--build-arg",
  `REVISION=${revision}`,
  ...tags.flatMap((tag) => ["--tag", tag]),
  "--push",
  ".",
];

console.log(`Publishing Compressarr ${version}:`);
for (const tag of tags) console.log(`  ${tag}`);

if (process.argv.includes("--dry-run")) {
  console.log(`\ndocker ${args.join(" ")}`);
} else {
  execFileSync("docker", args, { stdio: "inherit" });
}

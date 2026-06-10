#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const version = "0.1.0";
const configDirectory =
  process.platform === "win32"
    ? path.join(process.env.APPDATA ?? os.homedir(), "compressarr-node")
    : path.join(
        process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"),
        "compressarr-node",
      );
const configPath = path.join(configDirectory, "config.json");
let activeChild;
let stopping = false;

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

main().catch((error) => {
  status(`Error: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(version);
    return;
  }
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`compressarr-node ${version}

Usage:
  compressarr-node <enrollment-code>
  compressarr-node

The first command enrolls this host. Later runs use the saved credentials.`);
    return;
  }
  verifyFfmpeg();
  const enrollment = process.argv[2];
  const config = enrollment
    ? await enroll(enrollment)
    : await loadConfig();

  status(`Connected to ${config.coordinatorUrl} as ${config.name}`);
  while (!stopping) {
    try {
      status("Idle · waiting for work");
      const response = await api(config, "/api/node/jobs/claim", {
        method: "POST",
      });
      if (response.status === 204) {
        await sleep(5_000);
        continue;
      }
      await assertOk(response);
      const claim = await response.json();
      await processJob(config, claim);
    } catch (error) {
      status(`Connection error · ${error.message} · retrying in 10s`);
      await sleep(10_000);
    }
  }
  status("Stopped");
}

async function enroll(code) {
  let enrollment;
  try {
    enrollment = JSON.parse(Buffer.from(code, "base64url").toString("utf8"));
  } catch {
    throw new Error("The enrollment code is invalid.");
  }
  if (
    enrollment.version !== 1 ||
    !enrollment.coordinatorUrl ||
    !enrollment.secret
  ) {
    throw new Error("The enrollment code is invalid.");
  }

  status(`Registering with ${enrollment.coordinatorUrl}`);
  const response = await fetch(
    `${enrollment.coordinatorUrl.replace(/\/+$/, "")}/api/nodes/register`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${enrollment.secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        hostname: os.hostname(),
        name: os.hostname(),
        version,
      }),
    },
  );
  await assertOk(response);
  const registration = await response.json();
  const config = {
    coordinatorUrl: enrollment.coordinatorUrl.replace(/\/+$/, ""),
    nodeId: registration.id,
    name: registration.name,
    token: registration.token,
  };
  await fsPromises.mkdir(configDirectory, { recursive: true });
  await fsPromises.writeFile(configPath, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  return config;
}

async function loadConfig() {
  try {
    return JSON.parse(await fsPromises.readFile(configPath, "utf8"));
  } catch {
    throw new Error(
      "This node is not enrolled. Run the command shown in Compressarr Settings.",
    );
  }
}

async function processJob(config, claim) {
  const { job, leaseToken } = claim;
  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), `compressarr-node-${job.id}-`),
  );
  const sourcePath = path.join(directory, safeName(job.sourceName ?? "source.mkv"));
  const outputPath = path.join(directory, "output.mkv");
  const headers = { "x-compressarr-lease": leaseToken };
  let heartbeat;

  try {
    status(`Job ${job.id} · downloading ${job.sourceName}`);
    heartbeat = setInterval(
      () => void reportProgress(config, job.id, leaseToken, {}),
      15_000,
    );
    const sourceResponse = await api(
      config,
      `/api/node/jobs/${job.id}/source`,
      { headers },
    );
    await assertOk(sourceResponse);
    if (!sourceResponse.body) throw new Error("Source response was empty.");
    await pipeline(
      Readable.fromWeb(sourceResponse.body),
      fs.createWriteStream(sourcePath),
    );

    clearInterval(heartbeat);
    heartbeat = undefined;
    status(`Job ${job.id} · transcoding ${job.sourceName}`);
    await transcode(config, job, leaseToken, sourcePath, outputPath);

    status(`Job ${job.id} · uploading result`);
    heartbeat = setInterval(
      () => void reportProgress(config, job.id, leaseToken, {}),
      15_000,
    );
    const resultResponse = await api(
      config,
      `/api/node/jobs/${job.id}/result`,
      {
        method: "PUT",
        headers: {
          ...headers,
          "content-type": "application/octet-stream",
        },
        body: fs.createReadStream(outputPath),
        duplex: "half",
      },
    );
    await assertOk(resultResponse);
    const result = await resultResponse.json();
    status(
      `Job ${job.id} · ${result.status}${
        result.savedBytes ? ` · saved ${formatBytes(result.savedBytes)}` : ""
      }`,
    );
  } catch (error) {
    await reportFailure(config, job.id, leaseToken, error).catch(() => undefined);
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (activeChild && activeChild.exitCode === null) activeChild.kill("SIGTERM");
    activeChild = undefined;
    await fsPromises.rm(directory, { recursive: true, force: true });
  }
}

async function transcode(config, job, leaseToken, sourcePath, outputPath) {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-i",
    sourcePath,
    "-map",
    "0:v?",
    "-map",
    "0:a?",
    "-map",
    "0:s?",
    "-map",
    "0:t?",
    "-map_metadata",
    "0",
    "-map_chapters",
    "0",
    "-c",
    "copy",
    "-c:v:0",
    "libx265",
    "-preset",
    "medium",
    "-crf",
    String(job.crf),
  ];
  if (job.maximumResolution) {
    args.push(
      "-filter:v:0",
      `scale=${job.maximumResolution.width}:${job.maximumResolution.height}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    );
  }
  args.push(
    "-max_muxing_queue_size",
    "4096",
    "-progress",
    "pipe:1",
    "-nostats",
    "-f",
    "matroska",
    outputPath,
  );

  await new Promise((resolve, reject) => {
    activeChild = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let buffer = "";
    let values = {};
    let lastReport = 0;

    activeChild.stderr.setEncoding("utf8");
    activeChild.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-16_000);
    });
    activeChild.stdout.setEncoding("utf8");
    activeChild.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const separator = line.indexOf("=");
        if (separator < 0) continue;
        values[line.slice(0, separator)] = line.slice(separator + 1);
        if (line === "progress=continue" || line === "progress=end") {
          const now = Date.now();
          if (now - lastReport > 1_000 || line === "progress=end") {
            const progress = calculateProgress(values, job.durationSeconds);
            status(
              `Job ${job.id} · transcoding · ${progress.progressPercent.toFixed(
                1,
              )}% · ${progress.speed ?? "starting"} · ${formatDuration(
                progress.etaSeconds,
              )} remaining`,
            );
            void reportProgress(
              config,
              job.id,
              leaseToken,
              progress,
            ).then((response) => {
              if (response.cancel && activeChild?.exitCode === null) {
                activeChild.kill("SIGTERM");
              }
            });
            lastReport = now;
          }
          values = {};
        }
      }
    });
    activeChild.on("error", reject);
    activeChild.on("close", (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `FFmpeg exited ${code ?? signal}`));
    });
  });
}

function calculateProgress(values, duration) {
  const outputSeconds = Number(values.out_time_us ?? 0) / 1_000_000;
  const progressPercent = Math.max(
    0,
    Math.min(99.9, (outputSeconds / duration) * 100),
  );
  const speed = values.speed ?? null;
  const speedValue = Number((speed ?? "0x").replace("x", ""));
  return {
    progressPercent,
    speed,
    etaSeconds:
      speedValue > 0
        ? Math.max(0, Math.round((duration - outputSeconds) / speedValue))
        : null,
  };
}

async function reportProgress(config, jobId, leaseToken, progress) {
  const response = await api(
    config,
    `/api/node/jobs/${jobId}/progress`,
    {
      method: "POST",
      headers: {
        "x-compressarr-lease": leaseToken,
        "content-type": "application/json",
      },
      body: JSON.stringify(progress),
    },
  );
  await assertOk(response);
  return response.json();
}

async function reportFailure(config, jobId, leaseToken, error) {
  const response = await api(config, `/api/node/jobs/${jobId}/fail`, {
    method: "POST",
    headers: {
      "x-compressarr-lease": leaseToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      code: "REMOTE_NODE_FAILED",
      message: error instanceof Error ? error.message : String(error),
    }),
  });
  await assertOk(response);
}

function api(config, pathname, init = {}) {
  return fetch(`${config.coordinatorUrl}${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.token}`,
      ...init.headers,
    },
  });
}

async function assertOk(response) {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
}

function verifyFfmpeg() {
  for (const command of ["ffmpeg", "ffprobe"]) {
    const result = spawnSync(command, ["-version"], { stdio: "ignore" });
    if (result.status !== 0) {
      throw new Error(`${command} is required and was not found in PATH.`);
    }
  }
}

function safeName(value) {
  return path.basename(value).replaceAll(/[\0/\\]/g, "_");
}

function status(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${line}`);
  } else {
    console.log(line);
  }
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(Math.max(1, Math.abs(bytes))) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "calculating";
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function stop() {
  stopping = true;
  if (activeChild && activeChild.exitCode === null) activeChild.kill("SIGTERM");
  if (process.stdout.isTTY) process.stdout.write("\n");
}

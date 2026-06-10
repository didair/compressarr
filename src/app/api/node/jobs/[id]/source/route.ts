import fs from "node:fs";
import { Readable } from "node:stream";
import { z } from "zod";
import { apiError } from "@/lib/api";
import {
  authenticateLeasedJob,
  heartbeatRemoteJob,
} from "@/lib/remote-jobs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.coerce.number().int().positive().parse((await params).id);
    const lease = authenticateLeasedJob(request, id);
    if (!lease) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid job lease." } },
        { status: 401 },
      );
    }
    heartbeatRemoteJob(lease.node.id, lease.job.id);
    const stat = await fs.promises.stat(lease.job.sourcePath);
    const body = Readable.toWeb(fs.createReadStream(lease.job.sourcePath));
    return new Response(body as ReadableStream, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(stat.size),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
          lease.job.sourcePath.split("/").pop() ?? "source",
        )}`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

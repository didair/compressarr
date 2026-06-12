import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { jobs } from "@/db/schema";
import { apiError } from "@/lib/api";
import {
  authenticateLeasedJob,
  heartbeatRemoteJob,
} from "@/lib/remote-jobs";

const progressSchema = z.object({
  progressPercent: z.number().min(0).max(100).nullable().optional(),
  speed: z.string().max(50).nullable().optional(),
  etaSeconds: z.number().int().min(0).nullable().optional(),
});

export async function POST(
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
    const progress = progressSchema.parse(await request.json());
    heartbeatRemoteJob(lease.node.id, lease.job.id);
    if (Object.keys(progress).length > 0) {
      db.update(jobs)
        .set(progress)
        .where(eq(jobs.id, lease.job.id))
        .run();
    }
    const cancellationRequested = db
      .select({ value: jobs.cancellationRequestedAt })
      .from(jobs)
      .where(eq(jobs.id, lease.job.id))
      .get()?.value;
    return Response.json({ cancel: Boolean(cancellationRequested) });
  } catch (error) {
    return apiError(error);
  }
}

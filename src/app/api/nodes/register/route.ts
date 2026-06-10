import os from "node:os";
import { z } from "zod";
import { db } from "@/db/client";
import { remoteNodes } from "@/db/schema";
import { apiError } from "@/lib/api";
import {
  bearerToken,
  createSecret,
  getEnrollmentSecret,
  hashSecret,
  secretsEqual,
} from "@/lib/node-auth";

const registrationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  hostname: z.string().trim().min(1).max(255),
  version: z.string().trim().max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const enrollmentSecret = bearerToken(request);
    if (
      !enrollmentSecret ||
      !secretsEqual(enrollmentSecret, getEnrollmentSecret())
    ) {
      return Response.json(
        { error: { code: "UNAUTHORIZED", message: "Invalid enrollment code." } },
        { status: 401 },
      );
    }

    const input = registrationSchema.parse(await request.json());
    const token = createSecret();
    const node = db
      .insert(remoteNodes)
      .values({
        name: input.name ?? input.hostname ?? os.hostname(),
        hostname: input.hostname,
        tokenHash: hashSecret(token),
        version: input.version ?? null,
        status: "idle",
        lastSeenAt: new Date(),
      })
      .returning({ id: remoteNodes.id, name: remoteNodes.name })
      .get();

    return Response.json({ ...node, token }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}

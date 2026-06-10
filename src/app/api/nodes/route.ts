import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { remoteNodes } from "@/db/schema";
import { apiError } from "@/lib/api";
import { encodeEnrollment, getEnrollmentSecret } from "@/lib/node-auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const settings = getSettings();
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const forwardedHost = request.headers.get("x-forwarded-host");
    const host = forwardedHost ?? request.headers.get("host");
    const protocol =
      forwardedProtocol ?? (new URL(request.url).protocol === "https:" ? "https" : "http");
    const requestOrigin = host
      ? `${protocol}://${host}`
      : new URL(request.url).origin;
    const coordinatorUrl = (
      settings.nodeCoordinatorUrl || requestOrigin
    ).replace(/\/+$/, "");
    const enrollment = encodeEnrollment(
      coordinatorUrl,
      getEnrollmentSecret(),
    );
    const nodes = db
      .select()
      .from(remoteNodes)
      .orderBy(desc(remoteNodes.lastSeenAt))
      .all()
      .map((node) => ({
        id: node.id,
        name: node.name,
        hostname: node.hostname,
        version: node.version,
        status:
          node.lastSeenAt &&
          Date.now() - node.lastSeenAt.getTime() < 45_000
            ? node.status
            : "offline",
        lastSeenAt: node.lastSeenAt,
        currentJobId: node.currentJobId,
      }));

    return Response.json({
      coordinatorUrl,
      command: `compressarr-node ${enrollment}`,
      nodes,
    });
  } catch (error) {
    return apiError(error);
  }
}

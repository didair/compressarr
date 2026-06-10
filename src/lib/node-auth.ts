import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { remoteNodes, settings } from "@/db/schema";

export function createSecret(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function getEnrollmentSecret(): string {
  const stored = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "nodeEnrollmentSecret"))
    .get();
  if (stored) {
    try {
      const value = JSON.parse(stored.value);
      if (typeof value === "string" && value) return value;
    } catch {
      // Replace malformed stored enrollment secrets.
    }
  }

  const secret = createSecret();
  db.insert(settings)
    .values({
      key: "nodeEnrollmentSecret",
      value: JSON.stringify(secret),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(secret), updatedAt: new Date() },
    })
    .run();
  return secret;
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
}

export function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function authenticateNode(request: Request) {
  const token = bearerToken(request);
  if (!token) return null;
  return db
    .select()
    .from(remoteNodes)
    .where(eq(remoteNodes.tokenHash, hashSecret(token)))
    .get();
}

export function encodeEnrollment(coordinatorUrl: string, secret: string): string {
  return Buffer.from(
    JSON.stringify({ version: 1, coordinatorUrl, secret }),
  ).toString("base64url");
}

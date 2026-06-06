import { apiError } from "@/lib/api";
import { setQueuePaused } from "@/lib/settings";

export async function POST() {
  try {
    setQueuePaused(true);
    return Response.json({ queuePaused: true });
  } catch (error) {
    return apiError(error);
  }
}

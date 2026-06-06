import { apiError } from "@/lib/api";
import { setQueuePaused } from "@/lib/settings";

export async function POST() {
  try {
    setQueuePaused(false);
    return Response.json({ queuePaused: false });
  } catch (error) {
    return apiError(error);
  }
}

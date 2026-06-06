import { apiError } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getSettings());
}

export async function PUT(request: Request) {
  try {
    return Response.json(updateSettings(await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

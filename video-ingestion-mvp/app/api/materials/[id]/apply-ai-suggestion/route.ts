import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, jsonError, requireMaterial, requireAdmin } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  try {
    const updated = await ingestionPipeline.applyLatestSuggestion(material, authOperatorName(auth.user));
    return NextResponse.json(toJsonSafe({ material: updated }));
  } catch (error) {
    return jsonError((error as Error).message || "应用 AI 建议失败。");
  }
}

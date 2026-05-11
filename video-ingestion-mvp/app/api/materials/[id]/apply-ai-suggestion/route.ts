import { NextResponse } from "next/server";

import { getRouteId, jsonError, readJson, requireMaterial } from "@/app/api/_utils";
import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{ operatorName?: string }>(request);
  const material = await requireMaterial(id);
  try {
    const updated = await ingestionPipeline.applyLatestSuggestion(material, normalizeOperatorName(body.operatorName));
    return NextResponse.json({ material: updated });
  } catch (error) {
    return jsonError((error as Error).message || "应用 AI 建议失败。");
  }
}

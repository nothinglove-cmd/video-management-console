import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, readJson, requireAdmin, requireMaterial } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegenerateBody = {
  includeThumbnail?: boolean;
  includeAiFrames?: boolean;
  includePreview?: boolean;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  const body = await readJson<RegenerateBody>(request);
  const result = await ingestionPipeline.regenerateDerivativesForMaterial(material, {
    includeThumbnail: body.includeThumbnail ?? true,
    includeAiFrames: body.includeAiFrames ?? true,
    includePreview: body.includePreview ?? true,
    operatorName: authOperatorName(auth.user),
    reason: "手动重新生成缩略图、AI 抽帧和 preview MP4。"
  });

  return NextResponse.json(toJsonSafe(result));
}

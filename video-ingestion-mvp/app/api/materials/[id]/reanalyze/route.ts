import { NextResponse } from "next/server";

import { getRouteId, requireMaterial } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  const updated = await ingestionPipeline.reanalyzeMaterial(material);
  return NextResponse.json(toJsonSafe({ material: updated }));
}

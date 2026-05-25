import { NextResponse } from "next/server";

import { getRouteId, readJson, requireMaterial } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{ targetCategory?: string; operatorName?: string }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.restoreFromTrash({
    material,
    targetCategory: body.targetCategory,
    operatorName: body.operatorName
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

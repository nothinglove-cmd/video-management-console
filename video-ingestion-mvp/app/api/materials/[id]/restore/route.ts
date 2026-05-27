import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, readJson, requireMaterial, requireAdmin } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<{ targetCategory?: string }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.restoreFromTrash({
    material,
    targetCategory: body.targetCategory,
    operatorName: authOperatorName(auth.user)
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

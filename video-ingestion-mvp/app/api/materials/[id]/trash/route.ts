import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, readJson, requireMaterial, requireAdmin } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<{ notes?: string }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.deleteToTrash({
    material,
    operatorName: authOperatorName(auth.user),
    notes: body.notes
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

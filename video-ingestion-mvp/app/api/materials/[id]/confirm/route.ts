import { NextResponse } from "next/server";

import { getRouteId, readJson, requireMaterial } from "@/app/api/_utils";
import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{ operatorName?: string }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.confirmMaterial({
    material,
    operatorName: normalizeOperatorName(body.operatorName)
  });
  return NextResponse.json({ material: updated });
}

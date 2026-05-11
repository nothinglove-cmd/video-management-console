import { NextResponse } from "next/server";

import { getRouteId, readJson, requireMaterial } from "@/app/api/_utils";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{ operatorName?: string; notes?: string }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.deleteToTrash({
    material,
    operatorName: body.operatorName,
    notes: body.notes
  });
  return NextResponse.json({ material: updated });
}

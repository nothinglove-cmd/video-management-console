import { NextResponse } from "next/server";

import { getRouteId, jsonError, readJson, requireMaterial } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{ fileName?: string; operatorName?: string }>(request);
  if (!body.fileName) return jsonError("请输入新文件名。");
  const material = await requireMaterial(id);
  const updated = await storageService.renameMaterial({
    material,
    desiredFileName: body.fileName,
    operatorName: body.operatorName
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

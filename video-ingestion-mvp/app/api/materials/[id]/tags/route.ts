import { NextResponse } from "next/server";

import { getRouteId, readJson, requireMaterial } from "@/app/api/_utils";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{
    humanTags?: unknown;
    subject?: string | null;
    scene?: string | null;
    action?: string | null;
    usage?: string | null;
    notes?: string | null;
    humanConfirmed?: boolean;
    operatorName?: string;
  }>(request);
  const material = await requireMaterial(id);
  const updated = await storageService.updateHumanTags({
    material,
    humanTags: body.humanTags ?? material.humanTags,
    subject: body.subject ?? material.subject,
    scene: body.scene ?? material.scene,
    action: body.action ?? material.action,
    usage: body.usage ?? material.usage,
    notes: body.notes ?? material.notes,
    humanConfirmed: body.humanConfirmed,
    operatorName: body.operatorName
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

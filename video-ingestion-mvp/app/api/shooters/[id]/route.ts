import { NextResponse } from "next/server";
import type { ShooterStatus } from "@prisma/client";

import { getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { softDeleteShooter, updateShooter } from "@/lib/shooters/shooter.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES: ShooterStatus[] = ["ACTIVE", "DISABLED", "DELETED"];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<{
    name?: string;
    displayName?: string;
    notes?: string | null;
    status?: ShooterStatus;
  }>(request);

  if (body.status && !STATUSES.includes(body.status)) return jsonError("无效的拍摄人状态。");
  const shooter = await updateShooter(id, body);
  return NextResponse.json({ shooter });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const shooter = await softDeleteShooter(id);
  return NextResponse.json({ shooter });
}

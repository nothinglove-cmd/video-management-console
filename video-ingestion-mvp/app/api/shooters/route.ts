import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { jsonError, readJson } from "@/app/api/_utils";
import { createShooter, listShooters } from "@/lib/shooters/shooter.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const shooters = await listShooters({ activeOnly });
  return NextResponse.json({ shooters });
}

export async function POST(request: Request) {
  const body = await readJson<{ name?: string; displayName?: string; notes?: string }>(request);
  try {
    const shooter = await createShooter({
      name: body.name || body.displayName || "",
      displayName: body.displayName,
      notes: body.notes
    });
    return NextResponse.json({ shooter });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("拍摄人名称已存在。");
    }
    return jsonError((error as Error).message);
  }
}

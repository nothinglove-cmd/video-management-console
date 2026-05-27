import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { scanStorageHealth } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const report = await scanStorageHealth();
  return NextResponse.json(report);
}

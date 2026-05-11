import { NextResponse } from "next/server";

import { scanStorageHealth } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const report = await scanStorageHealth();
  return NextResponse.json(report);
}

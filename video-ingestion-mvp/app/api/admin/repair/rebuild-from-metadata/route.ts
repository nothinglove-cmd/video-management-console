import { NextResponse } from "next/server";

import { rebuildFromMetadata } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await rebuildFromMetadata());
}

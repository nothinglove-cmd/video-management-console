import { NextResponse } from "next/server";

import { rebuildSearchIndex } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(await rebuildSearchIndex());
}

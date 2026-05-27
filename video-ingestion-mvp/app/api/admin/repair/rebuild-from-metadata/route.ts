import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { rebuildFromMetadata } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  return NextResponse.json(await rebuildFromMetadata());
}

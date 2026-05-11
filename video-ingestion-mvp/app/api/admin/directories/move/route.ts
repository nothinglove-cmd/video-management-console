import { NextResponse } from "next/server";

import { moveRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = await moveRealDirectory({
      categoryId: String(body.categoryId || ""),
      targetParentId: String(body.targetParentId || ""),
      operatorName: body.operatorName,
      notes: body.notes
    });
    return NextResponse.json({ category });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

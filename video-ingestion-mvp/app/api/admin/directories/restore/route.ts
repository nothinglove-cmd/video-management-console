import { NextResponse } from "next/server";

import { restoreRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await restoreRealDirectory({
      categoryId: String(body.categoryId || ""),
      targetParentId: body.targetParentId ? String(body.targetParentId) : undefined,
      operatorName: body.operatorName,
      notes: body.notes
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

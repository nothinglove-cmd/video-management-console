import { NextResponse } from "next/server";

import { trashRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await trashRealDirectory({
      categoryId: String(body.categoryId || ""),
      operatorName: body.operatorName,
      notes: body.notes
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

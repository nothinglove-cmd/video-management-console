import { NextResponse } from "next/server";

import { createRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const category = await createRealDirectory({
      parentId: String(body.parentId || ""),
      name: String(body.name || ""),
      folderName: body.folderName ? String(body.folderName) : undefined,
      allowUpload: body.allowUpload !== false,
      sortOrder: Number(body.sortOrder || 100),
      operatorName: body.operatorName,
      notes: body.notes
    });
    return NextResponse.json({ category });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

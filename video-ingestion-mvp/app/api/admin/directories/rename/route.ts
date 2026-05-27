import { NextResponse } from "next/server";

import { authOperatorName, requireSuperAdmin } from "@/app/api/_utils";

import { renameRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const category = await renameRealDirectory({
      categoryId: String(body.categoryId || ""),
      name: String(body.name || ""),
      folderName: body.folderName ? String(body.folderName) : undefined,
      allowUpload: body.allowUpload !== false,
      sortOrder: Number(body.sortOrder || 100),
      status: body.status,
      operatorName: authOperatorName(auth.user),
      notes: body.notes
    });
    return NextResponse.json({ category });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

import { NextResponse } from "next/server";

import { authOperatorName, requireSuperAdmin } from "@/app/api/_utils";

import { trashRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await trashRealDirectory({
      categoryId: String(body.categoryId || ""),
      operatorName: authOperatorName(auth.user),
      notes: body.notes
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

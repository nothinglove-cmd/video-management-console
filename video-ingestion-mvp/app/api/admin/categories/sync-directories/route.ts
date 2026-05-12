import { NextResponse } from "next/server";

import { syncCategoryDirectories } from "@/lib/categories/category-directory-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await syncCategoryDirectories({ operatorName: body.operatorName });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "栏目目录同步失败。" },
      { status: 400 }
    );
  }
}

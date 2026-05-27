import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { previewCategoryDirectorySync } from "@/lib/categories/category-directory-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const preview = await previewCategoryDirectorySync();
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "栏目目录同步预览失败。" },
      { status: 500 }
    );
  }
}

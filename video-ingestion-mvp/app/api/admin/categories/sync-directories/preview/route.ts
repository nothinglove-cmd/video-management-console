import { NextResponse } from "next/server";

import { previewCategoryDirectorySync } from "@/lib/categories/category-directory-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

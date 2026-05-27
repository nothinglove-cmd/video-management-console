import { NextResponse } from "next/server";

import { authOperatorName, requireSuperAdmin } from "@/app/api/_utils";

import { syncCategoryDirectories } from "@/lib/categories/category-directory-sync.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const result = await syncCategoryDirectories({ operatorName: authOperatorName(auth.user) });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "栏目目录同步失败。" },
      { status: 400 }
    );
  }
}

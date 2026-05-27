import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { getSystemResetPreview } from "@/lib/admin/system-reset.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const preview = await getSystemResetPreview();
    return NextResponse.json(preview);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "系统初始化 preview 失败。" },
      { status: 500 }
    );
  }
}

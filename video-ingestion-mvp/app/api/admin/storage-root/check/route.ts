import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { checkStorageRootCandidate } from "@/lib/storage/storage-root-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const rootPath = typeof body?.rootPath === "string" ? body.rootPath : "";
    const checkResult = await checkStorageRootCandidate(rootPath);

    return NextResponse.json({
      success: checkResult.ok,
      message: checkResult.ok ? "存储根目录检查通过。" : "存储根目录检查未通过。",
      data: { checkResult },
      checkResult,
      errors: checkResult.errors,
      warnings: checkResult.warnings
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "检查存储根目录失败。",
        data: null,
        checkResult: null,
        errors: [error instanceof Error ? error.message : "未知错误。"],
        warnings: []
      },
      { status: 500 }
    );
  }
}

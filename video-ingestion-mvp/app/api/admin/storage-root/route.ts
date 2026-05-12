import { NextResponse } from "next/server";

import {
  applyStorageRoot,
  getStorageRootStatus,
  StorageRootConfigError
} from "@/lib/storage/storage-root-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getStorageRootStatus();
    return NextResponse.json({
      success: true,
      message: "已获取当前存储根目录状态。",
      data,
      errors: [],
      warnings: []
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: "获取存储根目录状态失败。",
        data: null,
        errors: [error instanceof Error ? error.message : "未知错误。"],
        warnings: []
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rootPath = typeof body?.rootPath === "string" ? body.rootPath : "";
    const data = await applyStorageRoot(rootPath);

    return NextResponse.json({
      success: true,
      message: "已保存新的存储根目录，并按 relativePath 重算数据库 absolutePath。未移动、复制或删除真实文件。",
      data,
      checkResult: data.checkResult,
      errors: [],
      warnings: data.checkResult.warnings
    });
  } catch (error) {
    if (error instanceof StorageRootConfigError) {
      return NextResponse.json(
        {
          success: false,
          message: error.message,
          data: null,
          checkResult: error.checkResult ?? null,
          errors: error.checkResult?.errors ?? [error.message],
          warnings: error.checkResult?.warnings ?? []
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "保存存储根目录失败。",
        data: null,
        checkResult: null,
        errors: [error instanceof Error ? error.message : "未知错误。"],
        warnings: []
      },
      { status: 500 }
    );
  }
}

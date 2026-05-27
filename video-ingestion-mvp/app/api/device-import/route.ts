import { NextResponse } from "next/server";

import { authOperatorName, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const folders = await ingestionPipeline.scanReadyDeviceImports();
    return NextResponse.json({
      folders,
      deviceImportPath: storageService.resolve("01_待导入/设备拷贝")
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "扫描设备导入目录失败。", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await readJson<{
      folderName?: string;
      uploaderName?: string;
      notes?: string;
    }>(request);
    if (!body.folderName) return jsonError("请选择包含 _READY.txt 的设备拷贝文件夹。");
    const result = await ingestionPipeline.importDeviceFolder({
      folderName: body.folderName,
      uploaderName: body.uploaderName || authOperatorName(auth.user),
      notes: body.notes
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "设备导入预检失败。");
  }
}

import { NextResponse } from "next/server";

import { jsonError, readJson } from "@/app/api/_utils";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
  try {
    const body = await readJson<{
      folderName?: string;
      uploaderName?: string;
      notes?: string;
    }>(request);
    if (!body.folderName) return jsonError("请选择包含 _READY.txt 的设备拷贝文件夹。");
    const result = await ingestionPipeline.importDeviceFolder({
      folderName: body.folderName,
      uploaderName: body.uploaderName || "设备导入",
      notes: body.notes
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "设备导入预检失败。");
  }
}

import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { getRouteId, requireMaterial } from "@/app/api/_utils";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  const absolutePath = await storageService.getDownloadPath(material);
  const data = await fs.readFile(absolutePath);

  await storageService.logOperation({
    materialId: material.materialId,
    operationType: "DOWNLOAD",
    beforeFileName: material.storedFileName,
    beforePath: material.relativePath,
    notes: "单文件下载"
  });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": material.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(material.storedFileName)}`
    }
  });
}

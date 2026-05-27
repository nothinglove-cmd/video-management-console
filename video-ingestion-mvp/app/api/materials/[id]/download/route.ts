import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { authOperatorName, canReadMaterial, getRouteId, materialReadDeniedResponse, requireMaterial, requireApiUser } from "@/app/api/_utils";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  if (!canReadMaterial(auth.user, material)) return materialReadDeniedResponse();
  const absolutePath = await storageService.getDownloadPath(material);
  const stat = await fs.stat(absolutePath);

  await storageService.logOperation({
    materialId: material.materialId,
    operationType: "DOWNLOAD",
    operatorName: authOperatorName(auth.user),
    beforeFileName: material.storedFileName,
    beforePath: material.relativePath,
    notes: "单文件下载"
  });

  const stream = createReadStream(absolutePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": material.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(material.storedFileName)}`,
      "Content-Length": String(stat.size)
    }
  });
}

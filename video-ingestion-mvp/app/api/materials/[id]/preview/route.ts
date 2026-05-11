import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

import { getRouteId, requireMaterial } from "@/app/api/_utils";
import { derivativeService } from "@/lib/media/derivative.service";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  const preview = await resolvePreviewSource(material.materialId);
  const absolutePath = preview?.absolutePath || await storageService.getDownloadPath(material);
  const contentType = preview?.mimeType || material.mimeType || "application/octet-stream";
  const stat = await fs.stat(absolutePath);
  const range = request.headers.get("range");

  if (range) {
    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : stat.size - 1;
    const stream = createReadStream(absolutePath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: 206,
      headers: {
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`
      }
    });
  }

  const stream = createReadStream(absolutePath);
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size)
    }
  });
}

async function resolvePreviewSource(materialId: string) {
  const preview = await derivativeService.findReadyPreviewMp4(materialId);
  if (!preview?.relativePath) return null;
  const absolutePath = storageService.resolve(preview.relativePath);
  if (!(await exists(absolutePath))) return null;
  return {
    absolutePath,
    mimeType: preview.mimeType || "video/mp4"
  };
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

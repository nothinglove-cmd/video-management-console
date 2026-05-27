import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";

import { canReadMaterial, getRouteId, materialReadDeniedResponse, requireMaterial, requireApiUser } from "@/app/api/_utils";
import { derivativeService } from "@/lib/media/derivative.service";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  if (!canReadMaterial(auth.user, material)) return materialReadDeniedResponse();
  const preview = await resolvePreviewSource(material.materialId);
  const absolutePath = preview?.absolutePath || await storageService.getDownloadPath(material);
  const contentType = preview?.mimeType || material.mimeType || "application/octet-stream";
  const stat = await fs.stat(absolutePath);
  const range = request.headers.get("range");

  if (range) {
    const parsed = parseRangeHeader(range, stat.size);
    if (!parsed) {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stat.size}`,
          "Accept-Ranges": "bytes"
        }
      });
    }
    const { start, end } = parsed;
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

function parseRangeHeader(range: string, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || size <= 0) return null;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1 };
  }

  const start = Number(startText);
  const requestedEnd = endText ? Number(endText) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd)) return null;
  if (start < 0 || start >= size || requestedEnd < start) return null;
  const end = Math.min(requestedEnd, size - 1);
  return { start, end };
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

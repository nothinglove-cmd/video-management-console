import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { canReadMaterial, getRouteId, jsonError, materialReadDeniedResponse, requireMaterial, requireApiUser } from "@/app/api/_utils";
import { derivativeService } from "@/lib/media/derivative.service";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await requireMaterial(id);
  if (!canReadMaterial(auth.user, material)) return materialReadDeniedResponse();
  const absolutePath = await resolveThumbnailPath(material.materialId, material.thumbnailPath);
  if (!absolutePath) return jsonError("暂无缩略图。", 404);
  const data = await fs.readFile(absolutePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "no-store"
    }
  });
}

async function resolveThumbnailPath(materialId: string, thumbnailPath?: string | null) {
  if (thumbnailPath) {
    const absolutePath = storageService.resolve(thumbnailPath);
    if (await exists(absolutePath)) return absolutePath;
  }

  const derivative = await derivativeService.findReadyThumbnail(materialId);
  if (!derivative?.relativePath) return null;
  const derivativeAbsolutePath = storageService.resolve(derivative.relativePath);
  if (await exists(derivativeAbsolutePath)) return derivativeAbsolutePath;
  return null;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

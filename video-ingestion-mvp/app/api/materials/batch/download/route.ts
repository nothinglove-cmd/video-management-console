import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import type { DerivativeFile, Material } from "@prisma/client";

import { authOperatorName, canReadMaterial, materialReadDeniedResponse, readJson, requireApiUser } from "@/app/api/_utils";
import { prisma } from "@/lib/prisma";
import { byteSizeToSafeNumber } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadVariant = "original" | "preview";

type DownloadBody = {
  ids?: string[];
  variant?: DownloadVariant;
};

type MaterialWithDerivatives = Material & { derivativeFiles: DerivativeFile[] };

type PackageEntry = {
  material: MaterialWithDerivatives;
  archivePath: string;
  absolutePath: string;
  size: number;
  mtime: Date;
  source: "original" | "preview";
};

type ManifestRow = {
  materialId: string;
  storedFileName: string;
  status: string;
  fileSize: number;
  primaryCategory: string;
  packagePath?: string;
  skippedReason?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  return createPackageResponse(request, {
    ids: parseIds(url.searchParams.get("ids")),
    variant: parseVariant(url.searchParams.get("variant"))
  });
}

export async function POST(request: Request) {
  const body = await readJson<DownloadBody>(request);
  return createPackageResponse(request, {
    ids: uniqueStrings(body.ids).slice(0, 144),
    variant: parseVariant(body.variant)
  });
}

async function createPackageResponse(request: Request, body: Required<DownloadBody>) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const ids = uniqueStrings(body.ids).slice(0, 144);
  if (ids.length === 0) {
    return NextResponse.json({ error: "请选择要下载的素材。" }, { status: 400 });
  }

  const materials = await prisma.material.findMany({
    where: {
      OR: [
        { id: { in: ids } },
        { materialId: { in: ids } }
      ]
    },
    include: {
      derivativeFiles: {
        where: {
          status: "READY",
          type: { in: ["PREVIEW_MP4", "THUMBNAIL"] }
        },
        orderBy: [
          { type: "asc" },
          { updatedAt: "desc" }
        ]
      }
    }
  });

  if (materials.some((material) => !canReadMaterial(auth.user, material))) {
    return materialReadDeniedResponse();
  }
  if (materials.length === 0) {
    return NextResponse.json({ error: "没有找到可下载的素材。" }, { status: 404 });
  }

  const byId = new Map(materials.flatMap((material) => [[material.id, material], [material.materialId, material]]));
  const orderedMaterials = ids.map((id) => byId.get(id)).filter((material): material is MaterialWithDerivatives => Boolean(material));
  const { entries, manifest } = await resolveEntries(orderedMaterials, body.variant);

  if (entries.length === 0) {
    return NextResponse.json({ error: "没有可打包下载的文件。", manifest }, { status: 404 });
  }

  const operatorName = authOperatorName(auth.user);
  await Promise.all(entries.map((entry) => storageService.logOperation({
    materialId: entry.material.materialId,
    operationType: "DOWNLOAD",
    operatorName,
    beforeFileName: entry.material.storedFileName,
    beforePath: entry.source === "original" ? entry.material.relativePath : entry.archivePath,
    notes: body.variant === "preview" ? "批量下载预览文件包" : "批量下载原文件包"
  }).catch(() => undefined)));

  const packageId = `materials-${body.variant}-${formatTimestamp(new Date())}`;
  const manifestContent = Buffer.from(JSON.stringify({
    packageId,
    variant: body.variant,
    generatedAt: new Date().toISOString(),
    totalRequested: orderedMaterials.length,
    includedCount: entries.length,
    skippedCount: manifest.filter((item) => item.skippedReason).length,
    materials: manifest
  }, null, 2));

  const stream = Readable.from(tarStream([
    {
      archivePath: "package_manifest.json",
      content: manifestContent,
      size: manifestContent.byteLength,
      mtime: new Date()
    },
    ...entries.map((entry) => ({
      archivePath: entry.archivePath,
      absolutePath: entry.absolutePath,
      size: entry.size,
      mtime: entry.mtime
    }))
  ]));

  return new NextResponse(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/x-tar",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${packageId}.tar`)}`,
      "Cache-Control": "no-store"
    }
  });
}

async function resolveEntries(materials: MaterialWithDerivatives[], variant: DownloadVariant) {
  const entries: PackageEntry[] = [];
  const manifest: ManifestRow[] = [];

  for (const [index, material] of materials.entries()) {
    const resolved = await resolveDownloadFile(material, variant);
    if (!resolved) {
      manifest.push(toManifestRow(material, undefined, variant === "preview" ? "缺少可用预览派生文件。" : "原文件不存在。"));
      continue;
    }

    entries.push({
      material,
      archivePath: archivePathFor(material, index + 1, resolved.fileName, resolved.source),
      absolutePath: resolved.absolutePath,
      size: resolved.stat.size,
      mtime: resolved.stat.mtime,
      source: resolved.source
    });
    manifest.push(toManifestRow(material, entries.at(-1)?.archivePath));
  }

  return { entries, manifest };
}

async function resolveDownloadFile(material: MaterialWithDerivatives, variant: DownloadVariant) {
  if (variant === "original") {
    try {
      const absolutePath = await storageService.getDownloadPath(material);
      return {
        absolutePath,
        fileName: material.storedFileName,
        stat: await fs.stat(absolutePath),
        source: "original" as const
      };
    } catch {
      return null;
    }
  }

  const derivative = material.derivativeFiles.find((item) => item.type === "PREVIEW_MP4") ||
    material.derivativeFiles.find((item) => item.type === "THUMBNAIL");
  if (!derivative) return null;

  const absolutePath = derivative.absolutePath || storageService.resolve(derivative.relativePath);
  try {
    return {
      absolutePath,
      fileName: derivative.fileName || path.basename(derivative.relativePath),
      stat: await fs.stat(absolutePath),
      source: "preview" as const
    };
  } catch {
    return null;
  }
}

function toManifestRow(material: MaterialWithDerivatives, packagePath?: string, skippedReason?: string): ManifestRow {
  return {
    materialId: material.materialId,
    storedFileName: material.storedFileName,
    status: material.status,
    fileSize: byteSizeToSafeNumber(material.fileSize),
    primaryCategory: material.primaryCategory,
    packagePath,
    skippedReason
  };
}

function archivePathFor(material: Material, index: number, fileName: string, source: "original" | "preview") {
  const folder = source === "preview" ? "previews" : "originals";
  const baseName = `${String(index).padStart(3, "0")}_${material.materialId}_${sanitizePathSegment(fileName)}`;
  return `${folder}/${truncateUtf8(baseName, 92)}`;
}

type TarItem =
  | { archivePath: string; content: Buffer; size: number; mtime: Date }
  | { archivePath: string; absolutePath: string; size: number; mtime: Date };

async function* tarStream(items: TarItem[]) {
  for (const item of items) {
    yield tarHeader(item.archivePath, item.size, item.mtime);
    if ("content" in item) {
      yield item.content;
    } else {
      const fileStream = createReadStream(item.absolutePath);
      for await (const chunk of fileStream) {
        yield chunk as Buffer;
      }
    }
    const padding = tarPadding(item.size);
    if (padding.length > 0) yield padding;
  }
  yield Buffer.alloc(1024);
}

function tarHeader(filePath: string, size: number, mtime: Date) {
  const header = Buffer.alloc(512, 0);
  const { name, prefix } = splitTarPath(filePath);
  writeString(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(mtime.getTime() / 1000));
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "video-ingestion");
  writeString(header, 297, 32, "video-ingestion");
  writeString(header, 345, 155, prefix);

  let sum = 0;
  for (const byte of header) sum += byte;
  writeChecksum(header, sum);
  return header;
}

function splitTarPath(filePath: string) {
  const normalized = filePath.split(path.sep).join("/");
  if (Buffer.byteLength(normalized) <= 100) return { name: normalized, prefix: "" };
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex > 0) {
    const prefix = normalized.slice(0, slashIndex);
    const name = normalized.slice(slashIndex + 1);
    if (Buffer.byteLength(name) <= 100 && Buffer.byteLength(prefix) <= 155) return { name, prefix };
  }
  return { name: truncateUtf8(path.posix.basename(normalized), 100), prefix: "" };
}

function writeString(buffer: Buffer, offset: number, length: number, value: string) {
  buffer.write(truncateUtf8(value, length - 1), offset, length, "utf8");
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number) {
  const octal = Math.floor(value).toString(8).padStart(length - 1, "0").slice(-(length - 1));
  buffer.write(octal, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

function writeChecksum(buffer: Buffer, sum: number) {
  const octal = sum.toString(8).padStart(6, "0").slice(-6);
  buffer.write(octal, 148, 6, "ascii");
  buffer[154] = 0;
  buffer[155] = 0x20;
}

function tarPadding(size: number) {
  const remainder = size % 512;
  return remainder === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - remainder);
}

function parseVariant(value?: string | null): DownloadVariant {
  return value === "preview" ? "preview" : "original";
}

function parseIds(value: string | null) {
  if (!value) return [];
  return value.split(",");
}

function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
}

function sanitizePathSegment(value: string) {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim() || "material";
}

function truncateUtf8(value: string, maxBytes: number) {
  let result = "";
  for (const char of value) {
    if (Buffer.byteLength(result + char) > maxBytes) break;
    result += char;
  }
  return result;
}

function formatTimestamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

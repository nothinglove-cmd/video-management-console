import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import type { DerivativeFile, Material } from "@prisma/client";

import { byteSizeToSafeNumber, toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";

export type DownloadVariant = "original" | "preview";
export type ExportFormat = "json" | "csv";
export type MaterialWithDerivatives = Material & { derivativeFiles: DerivativeFile[] };

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

type ExportRow = {
  materialId: string;
  storedFileName: string;
  originalFileName: string;
  status: string;
  fileSize: number;
  mimeType: string;
  duration: number | null;
  width: number | null;
  height: number | null;
  shooterName: string;
  uploaderName: string;
  primaryCategory: string;
  batchId: string;
  createdAt: string;
  downloadUrl: string;
};

export function parseDownloadVariant(value?: string | null): DownloadVariant {
  return value === "preview" ? "preview" : "original";
}

export function parseExportFormat(value?: string | null): ExportFormat {
  return value === "csv" ? "csv" : "json";
}

export function parseIds(value: string | null) {
  if (!value) return [];
  return value.split(",");
}

export function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
}

export function orderMaterialsByIds<T extends Material>(ids: string[], materials: T[]) {
  const byId = new Map(materials.flatMap((material) => [[material.id, material], [material.materialId, material]]));
  return ids.map((id) => byId.get(id)).filter((material): material is T => Boolean(material));
}

export async function createMaterialTarResponse({
  materials,
  variant,
  packageId,
  operatorName,
  logNote,
  manifestExtra
}: {
  materials: MaterialWithDerivatives[];
  variant: DownloadVariant;
  packageId: string;
  operatorName: string;
  logNote: string;
  manifestExtra?: Record<string, unknown>;
}) {
  const { entries, manifest } = await resolveEntries(materials, variant);

  if (entries.length === 0) {
    return NextResponse.json({ error: "没有可打包下载的文件。", manifest }, { status: 404 });
  }

  await Promise.all(entries.map((entry) => storageService.logOperation({
    materialId: entry.material.materialId,
    operationType: "DOWNLOAD",
    operatorName,
    beforeFileName: entry.material.storedFileName,
    beforePath: entry.source === "original" ? entry.material.relativePath : entry.archivePath,
    notes: logNote
  }).catch(() => undefined)));

  const generatedAt = new Date();
  const manifestContent = Buffer.from(JSON.stringify({
    packageId,
    variant,
    generatedAt: generatedAt.toISOString(),
    totalRequested: materials.length,
    includedCount: entries.length,
    skippedCount: manifest.filter((item) => item.skippedReason).length,
    ...manifestExtra,
    materials: manifest
  }, null, 2));

  const stream = Readable.from(tarStream([
    {
      archivePath: "package_manifest.json",
      content: manifestContent,
      size: manifestContent.byteLength,
      mtime: generatedAt
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

export function createMaterialExportResponse({
  materials,
  format,
  packageId,
  origin,
  exportedAt = new Date()
}: {
  materials: Material[];
  format: ExportFormat;
  packageId: string;
  origin: string;
  exportedAt?: Date;
}) {
  const rows = materials.map((material) => toExportRow(material, origin));

  if (format === "csv") {
    return textDownload(toCsv(rows), `${packageId}.csv`, "text/csv; charset=utf-8");
  }

  return textDownload(
    JSON.stringify(toJsonSafe({ packageId, exportedAt: exportedAt.toISOString(), count: rows.length, materials: rows }), null, 2),
    `${packageId}.json`,
    "application/json; charset=utf-8"
  );
}

export function formatPackageTimestamp(date: Date) {
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

function toExportRow(material: Material, origin: string): ExportRow {
  return {
    materialId: material.materialId,
    storedFileName: material.storedFileName,
    originalFileName: material.originalFileName,
    status: material.status,
    fileSize: byteSizeToSafeNumber(material.fileSize),
    mimeType: material.mimeType || "",
    duration: material.duration ?? null,
    width: material.width ?? null,
    height: material.height ?? null,
    shooterName: material.shooterName || "",
    uploaderName: material.uploaderName || "",
    primaryCategory: material.primaryCategory || "",
    batchId: material.batchId || "",
    createdAt: material.createdAt.toISOString(),
    downloadUrl: `${origin}/api/materials/${encodeURIComponent(material.id)}/download`
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

function textDownload(content: string, fileName: string, contentType: string) {
  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    }
  });
}

function toCsv(rows: ExportRow[]) {
  const headers = [
    "materialId",
    "storedFileName",
    "originalFileName",
    "status",
    "fileSize",
    "mimeType",
    "duration",
    "width",
    "height",
    "shooterName",
    "uploaderName",
    "primaryCategory",
    "batchId",
    "createdAt",
    "downloadUrl"
  ] satisfies Array<keyof ExportRow>;
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function csvCell(value: string | number | null) {
  const raw = value === null ? "" : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll("\"", "\"\"")}"`;
}

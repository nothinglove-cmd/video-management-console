import { NextResponse } from "next/server";

import { canReadMaterial, materialReadDeniedResponse, readJson, requireApiUser } from "@/app/api/_utils";
import { prisma } from "@/lib/prisma";
import { byteSizeToSafeNumber, toJsonSafe } from "@/lib/serialization/bigint-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportBody = {
  ids?: string[];
  format?: "json" | "csv";
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

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const body = await readJson<ExportBody>(request);
  const ids = uniqueStrings(body.ids).slice(0, 500);
  if (ids.length === 0) {
    return NextResponse.json({ error: "请选择要导出的素材。" }, { status: 400 });
  }

  const materials = await prisma.material.findMany({
    where: {
      OR: [
        { id: { in: ids } },
        { materialId: { in: ids } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  if (materials.some((material) => !canReadMaterial(auth.user, material))) {
    return materialReadDeniedResponse();
  }
  if (materials.length === 0) {
    return NextResponse.json({ error: "没有找到可导出的素材。" }, { status: 404 });
  }

  const byId = new Map(materials.flatMap((material) => [[material.id, material], [material.materialId, material]]));
  const orderedMaterials = ids.map((id) => byId.get(id)).filter((material): material is typeof materials[number] => Boolean(material));
  const origin = new URL(request.url).origin;
  const rows: ExportRow[] = orderedMaterials.map((material) => ({
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
  }));

  const packageId = `selection-${formatTimestamp(new Date())}`;
  if (body.format === "csv") {
    return textDownload(toCsv(rows), `${packageId}.csv`, "text/csv; charset=utf-8");
  }

  return textDownload(
    JSON.stringify(toJsonSafe({ packageId, exportedAt: new Date().toISOString(), count: rows.length, materials: rows }), null, 2),
    `${packageId}.json`,
    "application/json; charset=utf-8"
  );
}

function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
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

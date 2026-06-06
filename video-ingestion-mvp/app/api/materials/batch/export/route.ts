import { NextResponse } from "next/server";

import { canReadMaterial, materialReadDeniedResponse, readJson, requireApiUser } from "@/app/api/_utils";
import {
  createMaterialExportResponse,
  formatPackageTimestamp,
  orderMaterialsByIds,
  parseExportFormat,
  uniqueStrings,
  type ExportFormat
} from "@/lib/materials/material-selection-files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ExportBody = {
  ids?: string[];
  format?: ExportFormat;
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

  const orderedMaterials = orderMaterialsByIds(ids, materials);
  const origin = new URL(request.url).origin;
  const packageId = `selection-${formatPackageTimestamp(new Date())}`;
  return createMaterialExportResponse({
    materials: orderedMaterials,
    format: parseExportFormat(body.format),
    packageId,
    origin
  });
}

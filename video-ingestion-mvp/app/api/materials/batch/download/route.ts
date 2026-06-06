import { NextResponse } from "next/server";

import { authOperatorName, canReadMaterial, materialReadDeniedResponse, readJson, requireApiUser } from "@/app/api/_utils";
import {
  createMaterialTarResponse,
  formatPackageTimestamp,
  orderMaterialsByIds,
  parseDownloadVariant,
  parseIds,
  uniqueStrings,
  type DownloadVariant,
  type MaterialWithDerivatives
} from "@/lib/materials/material-selection-files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DownloadBody = {
  ids?: string[];
  variant?: DownloadVariant;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  return createSelectionDownloadResponse(request, {
    ids: parseIds(url.searchParams.get("ids")),
    variant: parseDownloadVariant(url.searchParams.get("variant"))
  });
}

export async function POST(request: Request) {
  const body = await readJson<DownloadBody>(request);
  return createSelectionDownloadResponse(request, {
    ids: uniqueStrings(body.ids).slice(0, 144),
    variant: parseDownloadVariant(body.variant)
  });
}

async function createSelectionDownloadResponse(request: Request, body: { ids: string[]; variant: DownloadVariant }) {
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

  const orderedMaterials = orderMaterialsByIds(ids, materials) as MaterialWithDerivatives[];
  const packageId = `materials-${body.variant}-${formatPackageTimestamp(new Date())}`;
  return createMaterialTarResponse({
    materials: orderedMaterials,
    variant: body.variant,
    packageId,
    operatorName: authOperatorName(auth.user),
    logNote: body.variant === "preview" ? "批量下载预览文件包" : "批量下载原文件包"
  });
}

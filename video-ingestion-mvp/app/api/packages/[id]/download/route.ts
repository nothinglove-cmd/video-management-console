import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, jsonError, requireAdmin } from "@/app/api/_utils";
import {
  createMaterialTarResponse,
  parseDownloadVariant,
  type MaterialWithDerivatives
} from "@/lib/materials/material-selection-files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const url = new URL(request.url);
  const variant = parseDownloadVariant(url.searchParams.get("variant"));
  const pkg = await prisma.materialPackage.findFirst({
    where: {
      OR: [
        { id },
        { packageId: id }
      ],
      NOT: { status: "DELETED" }
    },
    include: {
      items: {
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" }
        ],
        include: {
          material: {
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
          }
        }
      }
    }
  });

  if (!pkg) return jsonError("精选包不存在。", 404);
  const materials = pkg.items.map((item) => item.material) as MaterialWithDerivatives[];
  if (materials.length === 0) {
    return NextResponse.json({ error: "精选包内还没有素材。" }, { status: 400 });
  }

  return createMaterialTarResponse({
    materials,
    variant,
    packageId: `${pkg.packageId}-${variant}`,
    operatorName: authOperatorName(auth.user),
    logNote: variant === "preview" ? `下载精选包预览文件：${pkg.name}` : `下载精选包原文件：${pkg.name}`,
    manifestExtra: {
      materialPackageId: pkg.packageId,
      materialPackageName: pkg.name,
      purpose: pkg.purpose
    }
  });
}

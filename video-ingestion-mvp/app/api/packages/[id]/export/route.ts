import { NextResponse } from "next/server";

import { getRouteId, jsonError, requireAdmin } from "@/app/api/_utils";
import { createMaterialExportResponse, parseExportFormat } from "@/lib/materials/material-selection-files";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const url = new URL(request.url);
  const format = parseExportFormat(url.searchParams.get("format"));
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
        include: { material: true }
      }
    }
  });

  if (!pkg) return jsonError("精选包不存在。", 404);
  const materials = pkg.items.map((item) => item.material);
  if (materials.length === 0) {
    return NextResponse.json({ error: "精选包内还没有素材。" }, { status: 400 });
  }

  return createMaterialExportResponse({
    materials,
    format,
    packageId: `${pkg.packageId}-materials`,
    origin: new URL(request.url).origin
  });
}

import { NextResponse } from "next/server";

import { getRouteId, jsonError, requireAdmin } from "@/app/api/_utils";
import { toPackageDetailDto } from "@/lib/material-packages/material-packages";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const params = await Promise.resolve(context.params);
  const packageRouteId = await getRouteId({ params });
  const itemId = params.itemId;

  const result = await prisma.$transaction(async (tx) => {
    const pkg = await tx.materialPackage.findFirst({
      where: {
        OR: [
          { id: packageRouteId },
          { packageId: packageRouteId }
        ],
        NOT: { status: "DELETED" }
      }
    });
    if (!pkg) throw new Error("精选包不存在。");

    const item = await tx.materialPackageItem.findFirst({
      where: {
        packageId: pkg.packageId,
        OR: [
          { id: itemId },
          { materialId: itemId }
        ]
      }
    });
    if (!item) throw new Error("精选包内没有这个素材。");

    await tx.materialPackageItem.delete({ where: { id: item.id } });
    await tx.materialUsage.deleteMany({
      where: {
        materialId: item.materialId,
        usageType: "PACKAGE",
        usageRefId: pkg.packageId
      }
    });

    const updated = await tx.materialPackage.findUniqueOrThrow({
      where: { packageId: pkg.packageId },
      include: {
        items: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" }
          ],
          include: { material: true }
        },
        finishedWorks: {
          orderBy: { updatedAt: "desc" }
        },
        _count: { select: { items: true, finishedWorks: true } }
      }
    });

    return toPackageDetailDto(updated);
  }).catch((error) => ({ error: (error as Error).message || "移除精选包素材失败。" }));

  if ("error" in result) return jsonError(result.error, result.error.includes("不存在") ? 404 : 400);
  return NextResponse.json({ package: result });
}

import { NextResponse } from "next/server";

import { getRouteId, jsonError, requireAdmin } from "@/app/api/_utils";
import { toFinishedWorkDetailDto } from "@/lib/finished-works/finished-works";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const params = await Promise.resolve(context.params);
  const routeId = await getRouteId({ params });
  const itemId = params.itemId;

  const result = await prisma.$transaction(async (tx) => {
    const work = await tx.finishedWork.findFirst({
      where: {
        OR: [
          { id: routeId },
          { workId: routeId }
        ]
      }
    });
    if (!work) throw new Error("成片/交付记录不存在。");

    const item = await tx.finishedWorkMaterial.findFirst({
      where: {
        workId: work.workId,
        OR: [
          { id: itemId },
          { materialId: itemId }
        ]
      }
    });
    if (!item) throw new Error("成片素材清单里没有这个素材。");

    await tx.finishedWorkMaterial.delete({ where: { id: item.id } });
    await tx.materialUsage.deleteMany({
      where: {
        materialId: item.materialId,
        usageType: "FINISHED_WORK",
        usageRefId: work.workId
      }
    });

    const updated = await tx.finishedWork.findUniqueOrThrow({
      where: { workId: work.workId },
      include: detailInclude
    });

    return toFinishedWorkDetailDto(updated);
  }).catch((error) => ({ error: (error as Error).message || "移除成片素材失败。" }));

  if ("error" in result) return jsonError(result.error, result.error.includes("不存在") ? 404 : 400);
  return NextResponse.json({ finishedWork: result });
}

const detailInclude = {
  package: true,
  materials: {
    orderBy: [
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const }
    ],
    include: { material: true }
  },
  _count: { select: { materials: true } }
};

import { NextResponse } from "next/server";

import { getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { toFinishedWorkDetailDto } from "@/lib/finished-works/finished-works";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReorderBody = {
  itemIds?: string[];
  materialIds?: string[];
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<ReorderBody>(request);
  const orderedIds = uniqueStrings(body.itemIds?.length ? body.itemIds : body.materialIds).slice(0, 1000);
  if (!orderedIds.length) return jsonError("请提供排序后的素材。");

  const result = await prisma.$transaction(async (tx) => {
    const work = await tx.finishedWork.findFirst({
      where: {
        OR: [
          { id },
          { workId: id }
        ]
      }
    });
    if (!work) throw new Error("成片/交付记录不存在。");

    const items = await tx.finishedWorkMaterial.findMany({ where: { workId: work.workId } });
    const byId = new Map(items.flatMap((item) => [[item.id, item], [item.materialId, item]]));
    for (const [index, itemId] of orderedIds.entries()) {
      const item = byId.get(itemId);
      if (!item) continue;
      await tx.finishedWorkMaterial.update({
        where: { id: item.id },
        data: { sortOrder: (index + 1) * 10 }
      });
    }

    const updated = await tx.finishedWork.findUniqueOrThrow({
      where: { workId: work.workId },
      include: detailInclude
    });

    return toFinishedWorkDetailDto(updated);
  }).catch((error) => ({ error: (error as Error).message || "成片素材排序失败。" }));

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

function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
}

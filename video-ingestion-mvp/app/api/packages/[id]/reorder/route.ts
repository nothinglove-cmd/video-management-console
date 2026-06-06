import { NextResponse } from "next/server";

import { getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { toPackageDetailDto } from "@/lib/material-packages/material-packages";
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
  if (orderedIds.length === 0) return jsonError("请提供排序后的素材。");

  const result = await prisma.$transaction(async (tx) => {
    const pkg = await tx.materialPackage.findFirst({
      where: {
        OR: [
          { id },
          { packageId: id }
        ],
        NOT: { status: "DELETED" }
      }
    });
    if (!pkg) throw new Error("精选包不存在。");

    const items = await tx.materialPackageItem.findMany({ where: { packageId: pkg.packageId } });
    const byId = new Map(items.flatMap((item) => [[item.id, item], [item.materialId, item]]));
    for (const [index, itemId] of orderedIds.entries()) {
      const item = byId.get(itemId);
      if (!item) continue;
      await tx.materialPackageItem.update({
        where: { id: item.id },
        data: { sortOrder: (index + 1) * 10 }
      });
    }

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
  }).catch((error) => ({ error: (error as Error).message || "精选包排序失败。" }));

  if ("error" in result) return jsonError(result.error, result.error.includes("不存在") ? 404 : 400);
  return NextResponse.json({ package: result });
}

function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
}

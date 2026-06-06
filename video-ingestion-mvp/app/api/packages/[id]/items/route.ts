import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { toPackageDetailDto } from "@/lib/material-packages/material-packages";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddItemsBody = {
  ids?: string[];
  materialIds?: string[];
  notes?: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<AddItemsBody>(request);
  const ids = uniqueStrings([...(body.ids || []), ...(body.materialIds || [])]).slice(0, 500);
  if (ids.length === 0) return jsonError("请选择要加入精选包的素材。");

  const operatorName = authOperatorName(auth.user);
  const notes = cleanText(body.notes, 500);

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

    const materials = await tx.material.findMany({
      where: {
        OR: [
          { id: { in: ids } },
          { materialId: { in: ids } }
        ],
        NOT: { status: "TRASHED" }
      }
    });
    if (materials.length === 0) throw new Error("没有找到可加入精选包的素材。");

    const materialIds = materials.map((material) => material.materialId);
    const existingItems = await tx.materialPackageItem.findMany({
      where: {
        packageId: pkg.packageId,
        materialId: { in: materialIds }
      },
      select: { materialId: true }
    });
    const existingMaterialIds = new Set(existingItems.map((item) => item.materialId));
    const maxSort = await tx.materialPackageItem.aggregate({
      where: { packageId: pkg.packageId },
      _max: { sortOrder: true }
    });
    let sortOrder = maxSort._max.sortOrder ?? 0;
    let addedCount = 0;

    for (const material of materials) {
      await tx.materialUsage.upsert({
        where: {
          materialId_usageType_usageRefId: {
            materialId: material.materialId,
            usageType: "PACKAGE",
            usageRefId: pkg.packageId
          }
        },
        create: {
          materialId: material.materialId,
          usageType: "PACKAGE",
          usageRefId: pkg.packageId,
          usageRefLabel: pkg.name,
          notes,
          createdByName: operatorName
        },
        update: {
          usageRefLabel: pkg.name,
          notes: notes ?? undefined
        }
      });

      if (existingMaterialIds.has(material.materialId)) continue;
      sortOrder += 10;
      await tx.materialPackageItem.create({
        data: {
          packageId: pkg.packageId,
          materialId: material.materialId,
          sortOrder,
          notes
        }
      });
      await tx.fileOperationLog.create({
        data: {
          materialId: material.materialId,
          operationType: "ADD_TO_PACKAGE",
          operatorName,
          beforeFileName: material.storedFileName,
          beforePath: material.relativePath,
          notes: `加入精选包：${pkg.name}（${pkg.packageId}）`
        }
      });
      addedCount += 1;
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
        _count: { select: { items: true } }
      }
    });

    return {
      addedCount,
      skippedCount: materials.length - addedCount,
      package: toPackageDetailDto(updated)
    };
  }).catch((error) => ({ error: (error as Error).message || "加入精选包失败。" }));

  if ("error" in result) return jsonError(result.error, result.error.includes("不存在") ? 404 : 400);
  return NextResponse.json(result);
}

function uniqueStrings(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean)));
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

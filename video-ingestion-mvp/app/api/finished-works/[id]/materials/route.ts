import { NextResponse } from "next/server";

import { authOperatorName, getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { normalizeFinishedWorkRole, toFinishedWorkDetailDto } from "@/lib/finished-works/finished-works";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AddMaterialsBody = {
  ids?: string[];
  materialIds?: string[];
  packageId?: string | null;
  importPackage?: boolean;
  role?: string;
  notes?: string | null;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<AddMaterialsBody>(request);
  const explicitIds = uniqueStrings([...(body.ids || []), ...(body.materialIds || [])]).slice(0, 500);
  const role = body.role === undefined ? "OTHER" : normalizeFinishedWorkRole(body.role);
  if (!role) return jsonError("素材角色无效。");
  const notes = cleanNullableText(body.notes, 500);
  const operatorName = authOperatorName(auth.user);

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

    const sourcePackageId = cleanNullableText(body.packageId, 120) || (body.importPackage ? work.packageId : null);
    const sourcePackage = sourcePackageId
      ? await tx.materialPackage.findFirst({
        where: {
          OR: [
            { id: sourcePackageId },
            { packageId: sourcePackageId }
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
      })
      : null;
    if (sourcePackageId && !sourcePackage) throw new Error("来源精选包不存在。");

    const explicitMaterials = explicitIds.length
      ? await tx.material.findMany({
        where: {
          OR: [
            { id: { in: explicitIds } },
            { materialId: { in: explicitIds } }
          ],
          NOT: { status: "TRASHED" }
        }
      })
      : [];

    const materialById = new Map<string, { materialId: string }>();
    for (const item of sourcePackage?.items || []) {
      if (item.material.status !== "TRASHED") materialById.set(item.material.materialId, item.material);
    }
    for (const material of explicitMaterials) materialById.set(material.materialId, material);
    const materialIds = Array.from(materialById.keys());
    if (!materialIds.length) throw new Error("没有找到可加入成片的素材。");

    const existingItems = await tx.finishedWorkMaterial.findMany({
      where: {
        workId: work.workId,
        materialId: { in: materialIds }
      },
      select: { materialId: true }
    });
    const existingMaterialIds = new Set(existingItems.map((item) => item.materialId));
    const maxSort = await tx.finishedWorkMaterial.aggregate({
      where: { workId: work.workId },
      _max: { sortOrder: true }
    });
    let sortOrder = maxSort._max.sortOrder ?? 0;
    let addedCount = 0;

    for (const materialId of materialIds) {
      await tx.materialUsage.upsert({
        where: {
          materialId_usageType_usageRefId: {
            materialId,
            usageType: "FINISHED_WORK",
            usageRefId: work.workId
          }
        },
        create: {
          materialId,
          usageType: "FINISHED_WORK",
          usageRefId: work.workId,
          usageRefLabel: work.title,
          notes,
          createdByName: operatorName
        },
        update: {
          usageRefLabel: work.title,
          notes: notes ?? undefined
        }
      });

      if (existingMaterialIds.has(materialId)) continue;
      sortOrder += 10;
      await tx.finishedWorkMaterial.create({
        data: {
          workId: work.workId,
          materialId,
          sourcePackageId: sourcePackage?.packageId ?? work.packageId ?? null,
          role,
          sortOrder,
          notes
        }
      });
      addedCount += 1;
    }

    const updated = await tx.finishedWork.findUniqueOrThrow({
      where: { workId: work.workId },
      include: detailInclude
    });

    return {
      addedCount,
      skippedCount: materialIds.length - addedCount,
      finishedWork: toFinishedWorkDetailDto(updated)
    };
  }).catch((error) => ({ error: (error as Error).message || "加入成片素材失败。" }));

  if ("error" in result) return jsonError(result.error, result.error.includes("不存在") ? 404 : 400);
  return NextResponse.json(result);
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

function cleanNullableText(value: unknown, maxLength: number) {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

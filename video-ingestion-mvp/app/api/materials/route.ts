import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { isAdminUser, requireApiUser } from "@/app/api/_utils";

import { prisma } from "@/lib/prisma";
import { buildMaterialWhere } from "@/lib/search/material-search.service";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import {
  ASSET_TYPE_LABELS,
  getAllSelectableCategories
} from "@/lib/storage/storage.constants";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  try {
    const url = new URL(request.url);
    const adminUser = isAdminUser(auth.user);
    if (adminUser) {
      await storageService.initializeStorage();
      ingestionQueueService.kick();
    }
    const requestedScope = url.searchParams.get("scope");
    const trash = adminUser && url.searchParams.get("trash") === "1";
    const scope = adminUser
      ? trash ? "trash" : requestedScope
      : "library";
    const searchParams = {
      q: url.searchParams.get("q"),
      scope,
      status: adminUser ? url.searchParams.get("status") : safeUserStatus(url.searchParams.get("status")),
      assetType: url.searchParams.get("assetType"),
      rootCategory: url.searchParams.get("rootCategory"),
      subCategory: url.searchParams.get("subCategory"),
      shooter: url.searchParams.get("shooter"),
      confidenceMin: url.searchParams.get("confidenceMin"),
      confidenceMax: url.searchParams.get("confidenceMax"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      ingestSource: url.searchParams.get("ingestSource"),
      includeTrash: adminUser ? url.searchParams.get("includeTrash") : null,
      categoryPrefix: url.searchParams.get("categoryPrefix"),
      categoryId: url.searchParams.get("categoryId"),
      categoryIds: await getCategorySubtreeIds(url.searchParams.get("categoryId")),
      issue: url.searchParams.get("issue")
    };
    const usageState = normalizeUsageState(url.searchParams.get("usageState"));
    const usageWhere = await buildUsageStateWhere(usageState);
    const where = andWhere(buildMaterialWhere(searchParams), usageWhere);
    const facetWhere = andWhere(buildMaterialWhere({ ...searchParams, shooter: null }), usageWhere);
    const page = clampInt(url.searchParams.get("page"), 1, 100000, 1);
    const pageSize = clampInt(url.searchParams.get("pageSize"), 1, 144, 48);
    const skip = (page - 1) * pageSize;

    const [total, materials, uploaderRows] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          category: {
            select: {
              id: true,
              name: true,
              relativePath: true,
              assetType: true,
              status: true,
              allowUpload: true
            }
          },
          userSelectedCategory: {
            select: {
              id: true,
              name: true,
              relativePath: true,
              assetType: true,
              status: true,
              allowUpload: true
            }
          },
          aiSuggestedCategory: {
            select: {
              id: true,
              name: true,
              relativePath: true,
              assetType: true,
              status: true,
              allowUpload: true
            }
          },
          finalCategory: {
            select: {
              id: true,
              name: true,
              relativePath: true,
              assetType: true,
              status: true,
              allowUpload: true
            }
          },
          derivativeFiles: {
            orderBy: [
              { type: "asc" },
              { frameIndex: "asc" },
              { updatedAt: "desc" }
            ],
            select: {
              type: true,
              status: true,
              relativePath: true,
              fileSize: true,
              width: true,
              height: true,
              duration: true,
              frameIndex: true,
              errorMessage: true,
              updatedAt: true
            }
          },
          aiAnalysisJobs: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: {
              id: true,
              providerType: true,
              providerName: true,
              modelName: true,
              status: true,
              usedFallback: true,
              fallbackProviderType: true,
              confidence: true,
              durationMs: true,
              errorCode: true,
              errorMessage: true,
              createdAt: true,
              completedAt: true
            }
          },
          operationLogs: {
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      }),
      prisma.material.findMany({
        where: facetWhere,
        select: { shooterName: true, uploaderName: true },
        take: 1000
      })
    ]);
    const usageCountByMaterialId = await countUsagesForMaterials(materials.map((material) => material.materialId));
    const enrichedMaterials = materials.map((material) => {
      const usageCount = usageCountByMaterialId.get(material.materialId) || {
        usageCount: 0,
        packageUsageCount: 0,
        finishedWorkUsageCount: 0
      };
      return {
        ...material,
        ...usageCount,
        usageState: deriveMaterialUsageState(usageCount)
      };
    });
    const uploaders = Array.from(
      new Set(uploaderRows.map((item) => item.shooterName || item.uploaderName).filter((item): item is string => Boolean(item)))
    ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

    return NextResponse.json(toJsonSafe({
      materials: enrichedMaterials,
      categories: getAllSelectableCategories(),
      assetTypeLabels: ASSET_TYPE_LABELS,
      facets: { uploaders },
      pagination: {
        total,
        page,
        pageSize,
        pageCount: Math.max(1, Math.ceil(total / pageSize))
      }
    }));
  } catch (error) {
    console.error("[api/materials] search failed", error);
    return NextResponse.json(
      { error: `搜索接口出错：${(error as Error).message || "未知错误"}` },
      { status: 500 }
    );
  }
}

type UsageState = "all" | "unused" | "packaged" | "used_in_finished_work" | "packaged_only" | "reused";

function normalizeUsageState(value: string | null): UsageState {
  if (
    value === "unused" ||
    value === "packaged" ||
    value === "used_in_finished_work" ||
    value === "packaged_only" ||
    value === "reused"
  ) {
    return value;
  }
  return "all";
}

async function buildUsageStateWhere(usageState: UsageState): Promise<Prisma.MaterialWhereInput | null> {
  if (usageState === "all") return null;
  if (usageState === "unused") return { usages: { none: {} } };
  if (usageState === "packaged") return { usages: { some: { usageType: "PACKAGE" } } };
  if (usageState === "used_in_finished_work") return { usages: { some: { usageType: "FINISHED_WORK" } } };
  if (usageState === "packaged_only") {
    return {
      AND: [
        { usages: { some: { usageType: "PACKAGE" } } },
        { usages: { none: { usageType: "FINISHED_WORK" } } }
      ]
    };
  }

  const usageRows = await prisma.$queryRaw<Array<{ materialId: string }>>`
    SELECT "materialId"
    FROM "MaterialUsage"
    GROUP BY "materialId"
    HAVING COUNT(*) > 1
  `;
  const reusedMaterialIds = usageRows.map((row) => row.materialId);
  return { materialId: { in: reusedMaterialIds } };
}

function andWhere(...items: Array<Prisma.MaterialWhereInput | null | undefined>): Prisma.MaterialWhereInput {
  const filters = items.filter((item): item is Prisma.MaterialWhereInput => {
    if (!item || typeof item !== "object") return false;
    return Object.keys(item).length > 0;
  });
  if (filters.length === 0) return {};
  if (filters.length === 1) return filters[0];
  return { AND: filters };
}

async function countUsagesForMaterials(materialIds: string[]) {
  const empty = new Map<string, { usageCount: number; packageUsageCount: number; finishedWorkUsageCount: number }>();
  if (!materialIds.length) return empty;
  const rows = await prisma.materialUsage.groupBy({
    by: ["materialId", "usageType"],
    where: { materialId: { in: materialIds } },
    _count: { _all: true }
  });
  const result = new Map<string, { usageCount: number; packageUsageCount: number; finishedWorkUsageCount: number }>();
  for (const materialId of materialIds) {
    result.set(materialId, { usageCount: 0, packageUsageCount: 0, finishedWorkUsageCount: 0 });
  }
  for (const row of rows) {
    const counts = result.get(row.materialId) || { usageCount: 0, packageUsageCount: 0, finishedWorkUsageCount: 0 };
    const count = row._count._all;
    counts.usageCount += count;
    if (row.usageType === "PACKAGE") counts.packageUsageCount += count;
    if (row.usageType === "FINISHED_WORK") counts.finishedWorkUsageCount += count;
    result.set(row.materialId, counts);
  }
  return result;
}

function deriveMaterialUsageState(counts: { usageCount: number; packageUsageCount: number; finishedWorkUsageCount: number }) {
  if (counts.usageCount === 0) return "unused";
  if (counts.usageCount > 1 || counts.finishedWorkUsageCount > 1) return "reused";
  if (counts.finishedWorkUsageCount > 0) return "used_in_finished_work";
  if (counts.packageUsageCount > 0) return "packaged_only";
  return "all";
}

function safeUserStatus(status: string | null) {
  return status === "READY" || status === "IMPORTED" ? status : null;
}

async function getCategorySubtreeIds(categoryId?: string | null) {
  if (!categoryId) return [];
  const categories = await prisma.category.findMany({
    where: { NOT: { status: "DELETED" } },
    select: { id: true, parentId: true }
  });
  const childrenByParent = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenByParent.set(category.parentId, [...(childrenByParent.get(category.parentId) || []), category.id]);
  }
  const ids: string[] = [];
  const stack = [categoryId];
  const knownIds = new Set(categories.map((category) => category.id));
  while (stack.length) {
    const current = stack.pop();
    if (!current || ids.includes(current) || !knownIds.has(current)) continue;
    ids.push(current);
    stack.push(...(childrenByParent.get(current) || []));
  }
  return ids;
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

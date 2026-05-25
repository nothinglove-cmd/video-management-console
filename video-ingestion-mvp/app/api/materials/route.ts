import { NextResponse } from "next/server";

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
  try {
    await storageService.initializeStorage();
    ingestionQueueService.kick();
    const url = new URL(request.url);
    const trash = url.searchParams.get("trash") === "1";
    const searchParams = {
      q: url.searchParams.get("q"),
      scope: trash ? "trash" : url.searchParams.get("scope"),
      status: url.searchParams.get("status"),
      assetType: url.searchParams.get("assetType"),
      rootCategory: url.searchParams.get("rootCategory"),
      subCategory: url.searchParams.get("subCategory"),
      shooter: url.searchParams.get("shooter"),
      confidenceMin: url.searchParams.get("confidenceMin"),
      confidenceMax: url.searchParams.get("confidenceMax"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      ingestSource: url.searchParams.get("ingestSource"),
      includeTrash: url.searchParams.get("includeTrash"),
      categoryPrefix: url.searchParams.get("categoryPrefix"),
      categoryId: url.searchParams.get("categoryId"),
      categoryIds: await getCategorySubtreeIds(url.searchParams.get("categoryId")),
      issue: url.searchParams.get("issue")
    };
    const where = buildMaterialWhere(searchParams);
    const facetWhere = buildMaterialWhere({ ...searchParams, shooter: null });
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
    const uploaders = Array.from(
      new Set(uploaderRows.map((item) => item.shooterName || item.uploaderName).filter((item): item is string => Boolean(item)))
    ).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));

    return NextResponse.json(toJsonSafe({
      materials,
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

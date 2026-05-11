import { Prisma, type Material } from "@prisma/client";

import { storageService } from "@/lib/storage/storage.service";

export const MATERIAL_SEARCH_FIELDS = [
  "materialId",
  "storedFileName",
  "originalFileName",
  "shooterName",
  "uploaderName",
  "primaryCategory",
  "finalRootCategory",
  "finalSubCategory",
  "aiSuggestedRootCategory",
  "aiSuggestedSubCategory",
  "subjectType",
  "subject",
  "scene",
  "action",
  "usage",
  "aiSummary",
  "contentIntent",
  "contentLongevity",
  "topicName",
  "topicSuggestion",
  "searchText"
] as const;

export type MaterialSearchParams = {
  q?: string | null;
  scope?: string | null;
  status?: string | null;
  assetType?: string | null;
  rootCategory?: string | null;
  subCategory?: string | null;
  shooter?: string | null;
  confidenceMin?: string | null;
  confidenceMax?: string | null;
  from?: string | null;
  to?: string | null;
  ingestSource?: string | null;
  includeTrash?: string | null;
  categoryPrefix?: string | null;
  categoryId?: string | null;
  categoryIds?: string[];
  issue?: string | null;
};

const QUEUE_STATUSES = ["UPLOADED", "PROCESSING", "AI_TAGGED", "NEEDS_REVIEW", "REJECTED", "FAILED"] as const;
const LIBRARY_STATUSES = ["READY", "IMPORTED"] as const;
const MATERIAL_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "AI_TAGGED",
  "NEEDS_REVIEW",
  "IMPORTED",
  "READY",
  "TRASHED",
  "REJECTED",
  "FAILED"
] as const;
const ASSET_TYPES = ["ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE", "UNKNOWN"] as const;
const SOURCE_TYPES = ["WEB_MOBILE_UPLOAD", "WEB_DESKTOP_UPLOAD", "DEVICE_IMPORT", "MANUAL_IMPORT"] as const;
const MATERIAL_ISSUE_TYPES = [
  "CLASSIFICATION_CONFLICT",
  "NEEDS_REVIEW",
  "DERIVATIVE_FAILED",
  "AI_FAILED",
  "AI_FALLBACK",
  "NO_PREVIEW"
] as const;

const TERM_ALIASES: Record<string, Prisma.MaterialWhereInput[]> = {
  手机: [{ ingestSource: "WEB_MOBILE_UPLOAD" }, { searchText: { contains: "手机上传" } }],
  手机上传: [{ ingestSource: "WEB_MOBILE_UPLOAD" }, { searchText: { contains: "手机上传" } }],
  电脑: [{ ingestSource: "WEB_DESKTOP_UPLOAD" }, { searchText: { contains: "电脑上传" } }],
  电脑上传: [{ ingestSource: "WEB_DESKTOP_UPLOAD" }, { searchText: { contains: "电脑上传" } }],
  设备: [{ ingestSource: "DEVICE_IMPORT" }, { searchText: { contains: "设备导入" } }],
  设备导入: [{ ingestSource: "DEVICE_IMPORT" }, { searchText: { contains: "设备导入" } }],
  已入库: [{ status: { in: ["READY", "IMPORTED"] } }, { searchText: { contains: "已入库" } }],
  待确认: [{ status: "NEEDS_REVIEW" }, { searchText: { contains: "待确认" } }],
  动物: [
    { subjectType: "ANIMAL" },
    { primaryCategory: { contains: "动物" } },
    { searchText: { contains: "动物" } }
  ],
  人物: [
    { subjectType: "PERSON" },
    { primaryCategory: { contains: "人物" } },
    { searchText: { contains: "人物" } }
  ],
  风景: [
    { subjectType: "LANDSCAPE" },
    { primaryCategory: { contains: "场景" } },
    { searchText: { contains: "风景" } }
  ]
};

export function normalizeSearchQuery(query?: string | null) {
  return (query || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function splitSearchTerms(query?: string | null) {
  const normalized = normalizeSearchQuery(query);
  if (!normalized) return [];
  return normalized.split(" ").filter(Boolean).slice(0, 8);
}

export function buildMaterialWhere(params: MaterialSearchParams): Prisma.MaterialWhereInput {
  const and: Prisma.MaterialWhereInput[] = [];
  const scope = params.scope || "all";

  if (scope === "trash") {
    and.push({ status: "TRASHED" });
  } else if (scope === "queue") {
    and.push({
      OR: [
        { status: { in: [...QUEUE_STATUSES] } },
        { classificationConflict: true }
      ],
      NOT: { status: "TRASHED" }
    });
  } else if (scope === "library") {
    and.push({ status: { in: [...LIBRARY_STATUSES] } });
  } else if (scope === "all" && params.includeTrash !== "1") {
    and.push({ NOT: { status: "TRASHED" } });
  } else if (scope !== "all") {
    and.push({ NOT: { status: "TRASHED" } });
  }

  if (params.status === "UNKNOWN") {
    and.push({
      OR: [
        { assetType: "UNKNOWN" },
        { primaryCategory: { contains: "待整理" } },
        { finalSubCategory: "待整理" },
        { userSelectedSubCategory: "待整理" },
        { aiSuggestedSubCategory: "待整理" }
      ]
    });
  } else {
    const status = MATERIAL_STATUSES.find((item) => item === params.status);
    if (status) and.push({ status });
  }

  const assetType = ASSET_TYPES.find((item) => item === params.assetType);
  if (assetType) and.push({ assetType });

  const ingestSource = SOURCE_TYPES.find((item) => item === params.ingestSource);
  if (ingestSource) and.push({ ingestSource });

  if (params.rootCategory) {
    and.push({
      OR: [
        { finalRootCategory: params.rootCategory },
        { userSelectedRootCategory: params.rootCategory },
        { aiSuggestedRootCategory: params.rootCategory }
      ]
    });
  }

  if (params.subCategory) {
    and.push({
      OR: [
        { primaryCategory: params.subCategory },
        { finalSubCategory: params.subCategory },
        { userSelectedSubCategory: params.subCategory },
        { aiSuggestedSubCategory: params.subCategory }
      ]
    });
  }

  const categoryFilters: Prisma.MaterialWhereInput[] = [];
  const categoryIds = params.categoryIds?.filter(Boolean) || [];
  if (categoryIds.length) {
    categoryFilters.push(
      { categoryId: { in: categoryIds } },
      { finalCategoryId: { in: categoryIds } },
      { userSelectedCategoryId: { in: categoryIds } }
    );
  } else if (params.categoryId) {
    categoryFilters.push(
      { categoryId: params.categoryId },
      { finalCategoryId: params.categoryId },
      { userSelectedCategoryId: params.categoryId }
    );
  }
  if (params.categoryPrefix) {
    const prefix = params.categoryPrefix.replace(/\/+$/g, "");
    categoryFilters.push(
      { primaryCategory: prefix },
      { primaryCategory: { startsWith: `${prefix}/` } },
      { relativePath: { startsWith: `${prefix}/` } }
    );
  }
  if (categoryFilters.length) and.push({ OR: categoryFilters });

  const issue = MATERIAL_ISSUE_TYPES.find((item) => item === params.issue);
  if (issue === "CLASSIFICATION_CONFLICT") {
    and.push({ classificationConflict: true });
  }
  if (issue === "NEEDS_REVIEW") {
    and.push({ needsHumanReview: true });
  }
  if (issue === "DERIVATIVE_FAILED") {
    and.push({
      derivativeFiles: {
        some: {
          status: "FAILED"
        }
      }
    });
  }
  if (issue === "AI_FAILED") {
    and.push({
      aiAnalysisJobs: {
        some: {
          OR: [
            { status: "FAILED" },
            { AND: [{ errorCode: { not: null } }, { errorCode: { not: "" } }] },
            { AND: [{ errorMessage: { not: null } }, { errorMessage: { not: "" } }] }
          ]
        }
      }
    });
  }
  if (issue === "AI_FALLBACK") {
    and.push({
      aiAnalysisJobs: {
        some: {
          usedFallback: true
        }
      }
    });
  }
  if (issue === "NO_PREVIEW") {
    and.push({
      AND: [
        {
          OR: [
            { mimeType: { startsWith: "video/" } },
            { duration: { not: null } }
          ]
        },
        {
          NOT: {
            mimeType: { startsWith: "image/" }
          }
        },
        {
          derivativeFiles: {
            none: {
              type: "PREVIEW_MP4",
              status: "READY"
            }
          }
        }
      ]
    });
  }

  if (params.shooter) {
    and.push({
      OR: [
        { shooterName: params.shooter },
        { uploaderName: params.shooter }
      ]
    });
  }

  const confidenceMin = toNumber(params.confidenceMin);
  if (confidenceMin !== null) and.push({ aiConfidence: { gte: confidenceMin } });

  const confidenceMax = toNumber(params.confidenceMax);
  if (confidenceMax !== null) and.push({ aiConfidence: { lt: confidenceMax } });

  const from = toDate(params.from);
  if (from) and.push({ createdAt: { gte: from } });

  const to = toDate(params.to);
  if (to) and.push({ createdAt: { lte: to } });

  const terms = splitSearchTerms(params.q);
  for (const term of terms) {
    const alias = TERM_ALIASES[term] || [];
    and.push({
      OR: [
        ...MATERIAL_SEARCH_FIELDS.map((field) => ({
          [field]: { contains: term }
        })),
        ...alias
      ]
    });
  }

  return and.length ? { AND: and } : {};
}

export function buildSearchTextFromMaterial(material: Material) {
  return storageService.buildSearchText({
    materialId: material.materialId,
    storedFileName: material.storedFileName,
    originalFileName: material.originalFileName,
    shooterName: material.shooterName,
    uploaderName: material.uploaderName,
    primaryCategory: material.primaryCategory,
    finalRootCategory: material.finalRootCategory,
    finalSubCategory: material.finalSubCategory,
    aiSuggestedRootCategory: material.aiSuggestedRootCategory,
    aiSuggestedSubCategory: material.aiSuggestedSubCategory,
    subjectType: material.subjectType,
    subject: material.subject,
    scene: material.scene,
    action: material.action,
    usage: material.usage,
    aiSummary: material.aiSummary,
    contentIntent: material.contentIntent,
    contentLongevity: material.contentLongevity,
    topicName: material.topicName,
    topicSuggestion: material.topicSuggestion,
    customTags: material.customTags,
    humanTags: material.humanTags,
    visualTags: material.visualTags,
    aiEmotionTags: material.aiEmotionTags,
    aiUsageTags: material.aiUsageTags,
    aiSceneTags: material.aiSceneTags,
    aiSubjectTags: material.aiSubjectTags,
    aiActionTags: material.aiActionTags
  });
}

function toNumber(value?: string | null) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

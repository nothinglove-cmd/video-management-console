import type { SourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { byteSizeToSafeNumber } from "@/lib/serialization/bigint-json";
import type { ManualAssetType } from "@/modules/ingestion/ingestion.pipeline";
import { normalizeCustomTags } from "@/modules/ingestion/ingest-taxonomy";

export type UploadBatchMetadata = {
  sourceType: SourceType;
  uploaderName: string;
  shooterId: string;
  shooterName: string;
  categoryId: string;
  rootCategory: string;
  subCategory: string;
  customTags: string[];
  notes: string;
  manualAssetType: ManualAssetType;
};

export function isSourceType(value: unknown): value is SourceType {
  return (
    typeof value === "string" &&
    ["WEB_MOBILE_UPLOAD", "WEB_DESKTOP_UPLOAD", "DEVICE_IMPORT", "MANUAL_IMPORT"].includes(value)
  );
}

export function isManualAssetType(value: unknown): value is ManualAssetType {
  return (
    typeof value === "string" &&
    ["AUTO", "ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE"].includes(value)
  );
}

export function metadataFromForm(form: FormData): UploadBatchMetadata {
  const requestedSourceType = form.get("sourceType");
  const requestedManualAssetType = form.get("manualAssetType");
  const uploaderName = String(form.get("uploaderName") || "").trim() || "阿阳";

  return {
    sourceType: isSourceType(requestedSourceType) ? requestedSourceType : "WEB_DESKTOP_UPLOAD",
    uploaderName,
    shooterId: String(form.get("shooterId") || "").trim(),
    shooterName: String(form.get("shooterName") || "").trim() || uploaderName,
    categoryId: String(form.get("categoryId") || "").trim(),
    rootCategory: String(form.get("rootCategory") || "AUTO").trim(),
    subCategory: String(form.get("subCategory") || "AUTO").trim(),
    customTags: normalizeCustomTags(form.get("customTags")),
    notes: String(form.get("notes") || "").trim(),
    manualAssetType: isManualAssetType(requestedManualAssetType) ? requestedManualAssetType : "AUTO"
  };
}

export function metadataFromJson(value: unknown): UploadBatchMetadata {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const uploaderName = String(body.uploaderName || "").trim() || "阿阳";

  return {
    sourceType: isSourceType(body.sourceType) ? body.sourceType : "WEB_DESKTOP_UPLOAD",
    uploaderName,
    shooterId: String(body.shooterId || "").trim(),
    shooterName: String(body.shooterName || "").trim() || uploaderName,
    categoryId: String(body.categoryId || "").trim(),
    rootCategory: String(body.rootCategory || "AUTO").trim(),
    subCategory: String(body.subCategory || "AUTO").trim(),
    customTags: normalizeCustomTags(body.customTags),
    notes: String(body.notes || "").trim(),
    manualAssetType: isManualAssetType(body.manualAssetType) ? body.manualAssetType : "AUTO"
  };
}

export async function validateUploadCategory(categoryId: string) {
  const selectedCategory = categoryId
    ? await prisma.category.findUnique({
        where: { id: categoryId },
        include: { _count: { select: { children: true } } }
      })
    : null;

  if (categoryId && !selectedCategory) return { error: "选择的栏目不存在，请刷新后重新选择。", status: 400 as const };
  if (selectedCategory && selectedCategory.status !== "ACTIVE") {
    return { error: `栏目「${selectedCategory.name}」已停用，不能上传。`, status: 400 as const };
  }
  if (selectedCategory && !selectedCategory.allowUpload) {
    return { error: `栏目「${selectedCategory.name}」不允许上传。`, status: 400 as const };
  }
  if (selectedCategory && selectedCategory._count.children > 0) {
    return { error: `请选择「${selectedCategory.name}」下的具体子栏目。`, status: 400 as const };
  }
  if (selectedCategory && !selectedCategory.relativePath) {
    return { error: `栏目「${selectedCategory.name}」没有绑定真实目录。`, status: 400 as const };
  }

  return { selectedCategory };
}

export function validateUploadFile(file: File | null | undefined) {
  if (!file) return { error: "请选择要上传的文件。", status: 400 as const };
  return { file };
}

export function serializeUploadJob(job: {
  id: string;
  originalFileName: string;
  fileSize: bigint | number;
  sourceType: SourceType;
  incomingRelativePath: string;
  status: string;
  materialId?: string | null;
  attempts?: number;
  lastError?: string | null;
  createdAt?: Date;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  return {
    jobId: job.id,
    originalFileName: job.originalFileName,
    fileSize: byteSizeToSafeNumber(job.fileSize),
    sourceType: job.sourceType,
    incomingRelativePath: job.incomingRelativePath,
    status: job.status,
    materialId: job.materialId,
    attempts: job.attempts,
    lastError: job.lastError,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt
  };
}

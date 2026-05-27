import fs from "node:fs/promises";
import path from "node:path";
import { type AssetType, type Category, type Material, type MaterialStatus, type SourceType } from "@prisma/client";

import { writeCategoryMetadataJsonForRepair } from "@/lib/directories/directory.service";
import { derivativeService } from "@/lib/media/derivative.service";
import { mediaService } from "@/lib/media/media.service";
import { prisma } from "@/lib/prisma";
import type {
  StorageAuditIssue,
  StorageAuditIssueGroup,
  StorageAuditReport,
  StorageSafeFixAction,
  StorageSafeFixResult
} from "@/lib/repair/storage-audit.types";
import { buildSearchTextFromMaterial } from "@/lib/search/material-search.service";
import { byteSizeToBigInt, byteSizeToSafeNumber } from "@/lib/serialization/bigint-json";
import { PROCESSING_DIR } from "@/lib/storage/storage.constants";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

const DERIVATIVES_ROOT = "_derivatives";
const CATEGORY_METADATA_FILE = ".category.json";
const MEDIA_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".webm",
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".webp"
]);

const AUDIT_GROUPS: StorageAuditIssueGroup[] = [
  "MATERIAL_FILE",
  "METADATA_JSON",
  "DERIVATIVE_FILE",
  "AI_FRAME_INPUT",
  "PROCESSING_TEMP_FILE",
  "CATEGORY_DIRECTORY",
  "INGESTION_JOB_SOURCE"
];

const PROCESSING_TEMP_FRAME_SAMPLE_LIMIT = 8;
const DEFAULT_REGENERATE_DERIVATIVES_LIMIT = 200;

type StorageAuditIssueDraft = Omit<StorageAuditIssue, "id"> & { id?: string };

export async function scanStorageHealth(): Promise<StorageAuditReport> {
  await storageService.initializeStorage();
  const [materials, derivatives, aiAnalysisJobs, categories, ingestionJobs] = await Promise.all([
    prisma.material.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.derivativeFile.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.aIAnalysisJob.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ where: { status: { in: ["ACTIVE", "DISABLED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.ingestionJob.findMany({ orderBy: { createdAt: "desc" } })
  ]);
  const files = await walkStorage(storageService.root);
  const normalizedFiles = files.map(normalizeRelative);
  const fileSet = new Set(normalizedFiles);
  const processingTempFiles = normalizedFiles.filter(isProcessingTempFrame);
  const mediaFiles = normalizedFiles.filter((file) =>
    MEDIA_EXTENSIONS.has(path.extname(file).toLowerCase()) && !isDerivativePath(file) && !isProcessingTempFrame(file)
  );
  const derivativeDiskFiles = normalizedFiles.filter((file) => isDerivativePath(file));
  const metadataFiles = normalizedFiles.filter((file) => file.endsWith(".json") && file.includes("/metadata/"));
  const materialPaths = new Set(materials.map((item) => normalizeRelative(item.relativePath)));
  const materialIds = new Set(materials.map((item) => item.materialId));
  const derivativeReadyPaths = new Set(
    derivatives
      .filter((derivative) => derivative.status === "READY")
      .map((derivative) => normalizeRelative(derivative.relativePath))
  );
  const derivativeTrackedPaths = new Set(
    derivatives
      .filter((derivative) => derivative.status !== "DELETED")
      .map((derivative) => normalizeRelative(derivative.relativePath))
  );
  const readyAiFramePaths = new Set(
    derivatives
      .filter((derivative) => derivative.status === "READY" && derivative.type === "AI_FRAME")
      .map((derivative) => normalizeRelative(derivative.relativePath))
  );
  const readyThumbnailPaths = new Set(
    derivatives
      .filter((derivative) => derivative.status === "READY" && derivative.type === "THUMBNAIL")
      .map((derivative) => normalizeRelative(derivative.relativePath))
  );
  const issues: StorageAuditIssueDraft[] = [];

  for (const material of materials) {
    const relativePath = normalizeRelative(material.relativePath);
    const expectedAbsolutePath = storageService.resolve(relativePath);
    if (!(await exists(expectedAbsolutePath))) {
      issues.push({
        group: "MATERIAL_FILE",
        type: "DB_FILE_MISSING",
        severity: "error",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath,
        message: "数据库有素材记录，但真实文件不存在。"
      });
    }

    if (path.resolve(material.absolutePath) !== expectedAbsolutePath) {
      issues.push({
        group: "MATERIAL_FILE",
        type: "ABSOLUTE_PATH_MISMATCH",
        severity: "warning",
        safeFixable: true,
        fixAction: "FIX_MATERIAL_ABSOLUTE_PATH",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath,
        message: "Material.absolutePath 与 STORAGE_ROOT + relativePath 不一致。",
        details: {
          absolutePath: material.absolutePath,
          expectedAbsolutePath
        }
      });
    }

    if (material.storedFileName !== path.basename(relativePath)) {
      issues.push({
        group: "MATERIAL_FILE",
        type: "STORED_FILENAME_MISMATCH",
        severity: "warning",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath,
        message: "Material.storedFileName 与 relativePath 的文件名不一致。",
        details: { expectedFileName: path.basename(relativePath) }
      });
    }

    const metadataPath = storageService.getMetadataRelativePath(
      storageService.metadataCategoryForMaterial(material),
      material.materialId
    );
    const metadataAbsolutePath = storageService.resolve(metadataPath);
    const metadata = await readJsonWithError(metadataAbsolutePath);
    if (!metadata.exists) {
      issues.push({
        group: "METADATA_JSON",
        type: "METADATA_MISSING",
        severity: "warning",
        safeFixable: true,
        fixAction: "REWRITE_MATERIAL_METADATA",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath: normalizeRelative(metadataPath),
        message: "metadata JSON 缺失，可以由数据库记录重新生成。"
      });
    } else if (!metadata.ok) {
      issues.push({
        group: "METADATA_JSON",
        type: "METADATA_INVALID_JSON",
        severity: "error",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath: normalizeRelative(metadataPath),
        message: "metadata JSON 存在但无法解析。",
        details: { error: metadata.error }
      });
    } else if (metadata.payload) {
      compareMetadataPayload({
        issues,
        material,
        payload: metadata.payload,
        metadataPath: normalizeRelative(metadataPath),
        derivativePaths: derivatives
          .filter((derivative) => derivative.materialId === material.materialId && derivative.status !== "DELETED")
          .map((derivative) => normalizeRelative(derivative.relativePath))
      });
    }

    if (material.thumbnailPath && !(await exists(storageService.resolve(material.thumbnailPath)))) {
      issues.push({
        group: "MATERIAL_FILE",
        type: "THUMBNAIL_MISSING",
        severity: "info",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath: normalizeRelative(material.thumbnailPath),
        message: "缩略图路径存在于数据库，但真实缩略图文件不存在。"
      });
    }

    const readyThumbnail = derivatives.find((derivative) =>
      derivative.materialId === material.materialId &&
      derivative.type === "THUMBNAIL" &&
      derivative.status === "READY" &&
      fileSet.has(normalizeRelative(derivative.relativePath))
    );
    if (readyThumbnail?.relativePath) {
      const currentThumbnailPath = material.thumbnailPath ? normalizeRelative(material.thumbnailPath) : "";
      const currentThumbnailExists = currentThumbnailPath ? fileSet.has(currentThumbnailPath) : false;
      if (!currentThumbnailPath || !currentThumbnailExists) {
        issues.push({
          group: "MATERIAL_FILE",
          type: "THUMBNAIL_PATH_BACKFILL_AVAILABLE",
          severity: "info",
          safeFixable: true,
          fixAction: "BACKFILL_THUMBNAIL_PATH",
          materialId: material.materialId,
          fileName: readyThumbnail.fileName || path.basename(readyThumbnail.relativePath),
          relativePath: normalizeRelative(readyThumbnail.relativePath),
          message: "Material.thumbnailPath 缺失或指向不存在文件，但存在可回填的 READY THUMBNAIL。",
          details: { thumbnailPath: normalizeRelative(readyThumbnail.relativePath) }
        });
      }
    }

    if (material.thumbnailPath) {
      const thumbnailPath = normalizeRelative(material.thumbnailPath);
      if (isDerivativePath(thumbnailPath) && !readyThumbnailPaths.has(thumbnailPath)) {
        issues.push({
          group: "DERIVATIVE_FILE",
          type: "THUMBNAIL_DERIVATIVE_RECORD_MISSING",
          severity: "warning",
          materialId: material.materialId,
          fileName: path.basename(thumbnailPath),
          relativePath: thumbnailPath,
          message: "Material.thumbnailPath 指向 _derivatives，但没有对应 READY THUMBNAIL 记录。"
        });
      }
    }

    if (!material.searchText || !material.searchText.trim()) {
      issues.push({
        group: "METADATA_JSON",
        type: "SEARCH_INDEX_MISSING",
        severity: "info",
        safeFixable: true,
        fixAction: "REBUILD_SEARCH_TEXT",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath,
        message: "搜索索引为空，可以重建 searchText。"
      });
    }
  }

  for (const issue of buildProcessingTempFrameIssues(processingTempFiles)) {
    issues.push(issue);
  }

  for (const relativePath of mediaFiles) {
    if (relativePath.includes("/metadata/")) continue;
    if (!materialPaths.has(normalizeRelative(relativePath))) {
      issues.push({
        group: "MATERIAL_FILE",
        type: "ORPHAN_FILE",
        severity: "warning",
        fileName: path.basename(relativePath),
        relativePath,
        message: "真实文件存在，但数据库没有素材记录。"
      });
    }
  }

  for (const relativePath of metadataFiles) {
    const payload = await readJson(storageService.resolve(relativePath));
    const materialId = typeof payload?.materialId === "string" ? payload.materialId : path.basename(relativePath, ".json");
    if (!materialIds.has(materialId)) {
      issues.push({
        group: "METADATA_JSON",
        type: "METADATA_WITHOUT_DB",
        severity: "warning",
        materialId,
        fileName: path.basename(relativePath),
        relativePath,
        message: "metadata JSON 存在，但数据库没有对应素材记录。"
      });
    }
  }

  for (const derivative of derivatives) {
    if (derivative.status === "DELETED") continue;
    const relativePath = normalizeRelative(derivative.relativePath);
    if (derivative.status === "READY" && !fileSet.has(relativePath)) {
      issues.push({
        group: "DERIVATIVE_FILE",
        type: "READY_DERIVATIVE_FILE_MISSING",
        severity: "error",
        safeFixable: true,
        fixAction: "MARK_DERIVATIVE_FAILED",
        materialId: derivative.materialId,
        fileName: derivative.fileName || path.basename(relativePath),
        relativePath,
        message: "DerivativeFile 状态为 READY，但真实派生文件不存在。",
        details: { derivativeType: derivative.type }
      });
    }

    const expectedAbsolutePath = storageService.resolve(relativePath);
    if (derivative.absolutePath && path.resolve(derivative.absolutePath) !== expectedAbsolutePath) {
      issues.push({
        group: "DERIVATIVE_FILE",
        type: "DERIVATIVE_ABSOLUTE_PATH_MISMATCH",
        severity: "warning",
        materialId: derivative.materialId,
        fileName: derivative.fileName || path.basename(relativePath),
        relativePath,
        message: "DerivativeFile.absolutePath 与 STORAGE_ROOT + relativePath 不一致。",
        details: {
          derivativeType: derivative.type,
          absolutePath: derivative.absolutePath,
          expectedAbsolutePath
        }
      });
    }
  }

  for (const relativePath of derivativeDiskFiles) {
    if (!derivativeTrackedPaths.has(relativePath)) {
      issues.push({
        group: "DERIVATIVE_FILE",
        type: "ORPHAN_DERIVATIVE_FILE",
        severity: "warning",
        fileName: path.basename(relativePath),
        relativePath,
        message: "_derivatives 下存在真实文件，但 DerivativeFile 没有对应记录。"
      });
    }
  }

  for (const job of aiAnalysisJobs) {
    const framePaths = jsonStringArray(job.inputFramePaths);
    for (const framePath of framePaths) {
      const normalizedFramePath = normalizeRelative(framePath);
      const existsOnDisk = fileSet.has(normalizedFramePath);
      if (isDerivativePath(normalizedFramePath)) {
        if (!existsOnDisk || !readyAiFramePaths.has(normalizedFramePath)) {
          issues.push({
            group: "AI_FRAME_INPUT",
            type: "AI_DERIVATIVE_FRAME_INPUT_INVALID",
            severity: "error",
            materialId: job.materialId || undefined,
            fileName: path.basename(normalizedFramePath),
            relativePath: normalizedFramePath,
            message: "AIAnalysisJob.inputFramePaths 指向 _derivatives AI frame，但文件不存在或没有对应 READY AI_FRAME 记录。"
          });
        }
      } else if (!existsOnDisk) {
        issues.push({
          group: "AI_FRAME_INPUT",
          type: "AI_TEMP_FRAME_INPUT_MISSING",
          severity: "warning",
          materialId: job.materialId || undefined,
          fileName: path.basename(normalizedFramePath),
          relativePath: normalizedFramePath,
          message: "AIAnalysisJob.inputFramePaths 指向临时 processing 帧且当前不存在；重新识别产生的临时帧缺失只作为 warning。"
        });
      }
    }
  }

  for (const category of categories) {
    if (!category.relativePath) {
      issues.push({
        group: "CATEGORY_DIRECTORY",
        type: "CATEGORY_PATH_MISSING",
        severity: "warning",
        relativePath: undefined,
        message: `栏目「${category.name}」没有绑定 relativePath。`,
        details: { categoryId: category.id, status: category.status }
      });
      continue;
    }

    const categoryPath = normalizeRelative(category.relativePath);
    const categoryAbsolutePath = storageService.resolve(categoryPath);
    if (!(await directoryExists(categoryAbsolutePath))) {
      issues.push({
        group: "CATEGORY_DIRECTORY",
        type: "CATEGORY_DIRECTORY_MISSING",
        severity: "error",
        relativePath: categoryPath,
        message: `栏目「${category.name}」状态为 ${category.status}，但真实目录不存在。`,
        details: { categoryId: category.id, status: category.status }
      });
      continue;
    }

    const categoryMetadataPath = normalizeRelative(path.posix.join(categoryPath, CATEGORY_METADATA_FILE));
    const categoryMetadata = await readJsonWithError(storageService.resolve(categoryMetadataPath));
    if (!categoryMetadata.exists) {
      issues.push({
        group: "CATEGORY_DIRECTORY",
        type: "CATEGORY_METADATA_MISSING",
        severity: "warning",
        safeFixable: true,
        fixAction: "WRITE_CATEGORY_METADATA",
        relativePath: categoryMetadataPath,
        message: `栏目「${category.name}」缺少 .category.json。`,
        details: { categoryId: category.id, status: category.status }
      });
    } else if (!categoryMetadata.ok) {
      issues.push({
        group: "CATEGORY_DIRECTORY",
        type: "CATEGORY_METADATA_INVALID_JSON",
        severity: "error",
        relativePath: categoryMetadataPath,
        message: `栏目「${category.name}」的 .category.json 无法解析。`,
        details: { categoryId: category.id, error: categoryMetadata.error }
      });
    } else if (categoryMetadata.payload) {
      compareCategoryMetadata({
        issues,
        category,
        payload: categoryMetadata.payload,
        relativePath: categoryMetadataPath
      });
    }
  }

  for (const job of ingestionJobs) {
    const incomingRelativePath = normalizeRelative(job.incomingRelativePath);
    const sourceExists = fileSet.has(incomingRelativePath);
    if ((job.status === "QUEUED" || job.status === "RUNNING") && !sourceExists) {
      issues.push({
        group: "INGESTION_JOB_SOURCE",
        type: "ACTIVE_INGESTION_SOURCE_MISSING",
        severity: "error",
        fileName: job.originalFileName,
        relativePath: incomingRelativePath,
        message: `${job.status} 入库任务的 incomingRelativePath 不存在。`,
        details: { jobId: job.id, batchId: job.batchId, status: job.status }
      });
    }

    if (job.status === "FAILED" && !sourceExists) {
      issues.push({
        group: "INGESTION_JOB_SOURCE",
        type: "FAILED_INGESTION_SOURCE_MISSING",
        severity: "warning",
        fileName: job.originalFileName,
        relativePath: incomingRelativePath,
        message: "FAILED 入库任务源文件缺失，当前不可直接重试。",
        details: { jobId: job.id, batchId: job.batchId, status: job.status }
      });
    }
  }

  const finalizedIssues = finalizeIssues(issues);
  const counts = buildCounts({
    issues: finalizedIssues,
    materials: materials.length,
    mediaFiles: mediaFiles.length,
    metadataFiles: metadataFiles.length,
    derivativeFiles: derivativeDiskFiles.length,
    categories: categories.length,
    ingestionJobs: ingestionJobs.length,
    aiAnalysisJobs: aiAnalysisJobs.length
  });

  return {
    scannedAt: new Date().toISOString(),
    storageRoot: storageService.root,
    counts,
    issues: finalizedIssues
  };
}

function buildCounts(params: {
  issues: StorageAuditIssue[];
  materials: number;
  mediaFiles: number;
  metadataFiles: number;
  derivativeFiles: number;
  categories: number;
  ingestionJobs: number;
  aiAnalysisJobs: number;
}) {
  const byGroup = AUDIT_GROUPS.reduce<Record<StorageAuditIssueGroup, number>>((acc, group) => {
    acc[group] = 0;
    return acc;
  }, {} as Record<StorageAuditIssueGroup, number>);

  for (const issue of params.issues) {
    byGroup[issue.group] += 1;
  }

  return {
    materials: params.materials,
    mediaFiles: params.mediaFiles,
    metadataFiles: params.metadataFiles,
    derivativeFiles: params.derivativeFiles,
    categories: params.categories,
    ingestionJobs: params.ingestionJobs,
    aiAnalysisJobs: params.aiAnalysisJobs,
    issues: params.issues.length,
    totalIssues: params.issues.length,
    errorCount: params.issues.filter((issue) => issue.severity === "error").length,
    warningCount: params.issues.filter((issue) => issue.severity === "warning").length,
    infoCount: params.issues.filter((issue) => issue.severity === "info").length,
    safeFixableCount: params.issues.filter((issue) => issue.safeFixable).length,
    byGroup
  };
}

function finalizeIssues(issues: StorageAuditIssueDraft[]): StorageAuditIssue[] {
  return issues.map((issue) => ({
    ...issue,
    id: issue.id || buildIssueId(issue)
  }));
}

function buildIssueId(issue: StorageAuditIssueDraft) {
  const details = issue.details ?? {};
  const stableParts = [
    issue.group,
    issue.type,
    issue.materialId || "",
    issue.relativePath || "",
    stringDetail(details.categoryId),
    stringDetail(details.jobId),
    stringDetail(details.derivativeType),
    stringDetail(details.field),
    stringDetail(details.derivativePath),
    stringDetail(details.thumbnailPath),
    stringDetail(details.frameCount)
  ];
  return stableParts.map((part) => encodeURIComponent(part)).join(":");
}

function stringDetail(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function compareMetadataPayload(params: {
  issues: StorageAuditIssueDraft[];
  material: Material;
  payload: Record<string, unknown>;
  metadataPath: string;
  derivativePaths: string[];
}) {
  const { issues, material, payload, metadataPath } = params;
  compareMetadataField(issues, material, payload, metadataPath, "materialId", material.materialId);
  compareMetadataField(issues, material, payload, metadataPath, "relativePath", normalizeRelative(material.relativePath));
  compareMetadataField(issues, material, payload, metadataPath, "categoryId", material.categoryId);
  compareMetadataField(issues, material, payload, metadataPath, "finalCategoryId", material.finalCategoryId);
  compareMetadataField(issues, material, payload, metadataPath, "thumbnailPath", material.thumbnailPath ? normalizeRelative(material.thumbnailPath) : null);

  const metadataDerivatives = Array.isArray(payload.derivatives)
    ? payload.derivatives
        .map((item) => item && typeof item === "object" ? (item as Record<string, unknown>).relativePath : null)
        .filter((value): value is string => typeof value === "string")
        .map(normalizeRelative)
    : [];
  const metadataDerivativeSet = new Set(metadataDerivatives);
  for (const derivativePath of params.derivativePaths) {
    if (!metadataDerivativeSet.has(derivativePath)) {
      issues.push({
        group: "METADATA_JSON",
        type: "METADATA_DERIVATIVE_MISSING",
        severity: "warning",
        safeFixable: true,
        fixAction: "REWRITE_MATERIAL_METADATA",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath: metadataPath,
        message: "metadata JSON 的 derivatives 数组缺少数据库中的 DerivativeFile 记录。",
        details: { derivativePath }
      });
    }
  }
  for (const derivativePath of metadataDerivativeSet) {
    if (!params.derivativePaths.includes(derivativePath)) {
      issues.push({
        group: "METADATA_JSON",
        type: "METADATA_DERIVATIVE_WITHOUT_DB",
        severity: "warning",
        safeFixable: true,
        fixAction: "REWRITE_MATERIAL_METADATA",
        materialId: material.materialId,
        fileName: material.storedFileName,
        relativePath: metadataPath,
        message: "metadata JSON 的 derivatives 数组存在数据库中没有的派生文件记录。",
        details: { derivativePath }
      });
    }
  }
}

function compareMetadataField(
  issues: StorageAuditIssueDraft[],
  material: Material,
  payload: Record<string, unknown>,
  metadataPath: string,
  field: string,
  expected: string | null
) {
  const actual = typeof payload[field] === "string" ? normalizeRelative(String(payload[field])) : payload[field] ?? null;
  const normalizedExpected = typeof expected === "string" ? normalizeRelative(expected) : expected;
  if (actual !== normalizedExpected) {
    issues.push({
      group: "METADATA_JSON",
      type: "METADATA_FIELD_MISMATCH",
      severity: "warning",
      safeFixable: true,
      fixAction: "REWRITE_MATERIAL_METADATA",
      materialId: material.materialId,
      fileName: material.storedFileName,
      relativePath: metadataPath,
      message: `metadata JSON 字段 ${field} 与数据库记录不一致。`,
      details: { field, actual, expected: normalizedExpected }
    });
  }
}

function compareCategoryMetadata(params: {
  issues: StorageAuditIssueDraft[];
  category: Category;
  payload: Record<string, unknown>;
  relativePath: string;
}) {
  const fields = {
    id: params.category.id,
    name: params.category.name,
    relativePath: normalizeRelative(params.category.relativePath || ""),
    status: params.category.status
  };

  for (const [field, expected] of Object.entries(fields)) {
    const actual = typeof params.payload[field] === "string"
      ? normalizeRelative(String(params.payload[field]))
      : params.payload[field];
    if (actual !== expected) {
      params.issues.push({
        group: "CATEGORY_DIRECTORY",
        type: "CATEGORY_METADATA_FIELD_MISMATCH",
        severity: "warning",
        safeFixable: true,
        fixAction: "WRITE_CATEGORY_METADATA",
        relativePath: params.relativePath,
        message: `栏目「${params.category.name}」的 .category.json 字段 ${field} 与数据库不一致。`,
        details: {
          categoryId: params.category.id,
          field,
          actual,
          expected
        }
      });
    }
  }
}

export async function fixSafeStorageIssues(issueIds: string[]): Promise<StorageSafeFixResult> {
  const requestedIds = new Set(issueIds.filter(Boolean));
  const report = await scanStorageHealth();
  const currentIssuesById = new Map(report.issues.map((issue) => [issue.id, issue]));
  const fixed: StorageSafeFixResult["fixed"] = [];
  const skipped: StorageSafeFixResult["skipped"] = [];
  const failed: StorageSafeFixResult["failed"] = [];

  for (const issueId of requestedIds) {
    const issue = currentIssuesById.get(issueId);
    if (!issue) {
      skipped.push({ issueId, message: "重新扫描后该问题已不存在，已跳过。" });
      continue;
    }
    if (!issue.safeFixable || !issue.fixAction || !isAllowedSafeFixAction(issue.fixAction)) {
      skipped.push({
        issueId,
        type: issue.type,
        message: "该问题不在低风险安全修复白名单内，已跳过。"
      });
      continue;
    }

    try {
      const message = await applySafeFix(issue);
      fixed.push({ issueId, type: issue.type, message });
    } catch (error) {
      failed.push({
        issueId,
        type: issue.type,
        message: (error as Error).message || "修复失败。"
      });
    }
  }

  return {
    fixed,
    skipped,
    failed,
    message: `安全修复完成：成功 ${fixed.length}，跳过 ${skipped.length}，失败 ${failed.length}。`
  };
}

function isAllowedSafeFixAction(action: StorageSafeFixAction) {
  return action === "REWRITE_MATERIAL_METADATA" ||
    action === "FIX_MATERIAL_ABSOLUTE_PATH" ||
    action === "WRITE_CATEGORY_METADATA" ||
    action === "MARK_DERIVATIVE_FAILED" ||
    action === "BACKFILL_THUMBNAIL_PATH" ||
    action === "REBUILD_SEARCH_TEXT";
}

async function applySafeFix(issue: StorageAuditIssue) {
  if (issue.fixAction === "REWRITE_MATERIAL_METADATA") {
    const material = await requireMaterialByIssue(issue);
    const metadataPath = await storageService.writeMetadataJson(material);
    return `已重写 metadata JSON：${metadataPath}`;
  }

  if (issue.fixAction === "FIX_MATERIAL_ABSOLUTE_PATH") {
    const material = await requireMaterialByIssue(issue);
    const absolutePath = storageService.resolve(material.relativePath);
    await prisma.material.update({
      where: { id: material.id },
      data: { absolutePath }
    });
    return "已修正 Material.absolutePath。";
  }

  if (issue.fixAction === "WRITE_CATEGORY_METADATA") {
    const categoryId = stringDetail(issue.details?.categoryId);
    if (!categoryId) throw new Error("缺少 categoryId，无法写入 .category.json。");
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new Error("栏目不存在，无法写入 .category.json。");
    if (!category.relativePath) throw new Error("栏目没有 relativePath，无法写入 .category.json。");
    if (!(await directoryExists(storageService.resolve(category.relativePath)))) {
      throw new Error("栏目真实目录不存在，无法写入 .category.json。");
    }
    await writeCategoryMetadataJsonForRepair(category);
    return "已补写/重写 .category.json。";
  }

  if (issue.fixAction === "MARK_DERIVATIVE_FAILED") {
    if (!issue.materialId || !issue.relativePath) throw new Error("缺少派生文件定位信息。");
    const result = await prisma.derivativeFile.updateMany({
      where: {
        materialId: issue.materialId,
        relativePath: issue.relativePath,
        status: "READY"
      },
      data: {
        status: "FAILED",
        errorMessage: "存储巡检安全修复：READY 派生文件对应真实文件缺失，已标记为 FAILED。"
      }
    });
    if (result.count === 0) throw new Error("没有找到仍为 READY 的 DerivativeFile，可能已被其他操作处理。");
    return `已将 ${result.count} 条缺失派生文件记录标记为 FAILED。`;
  }

  if (issue.fixAction === "BACKFILL_THUMBNAIL_PATH") {
    const material = await requireMaterialByIssue(issue);
    const thumbnailPath = stringDetail(issue.details?.thumbnailPath || issue.relativePath);
    if (!thumbnailPath) throw new Error("缺少可回填 thumbnailPath。");
    const thumbnail = await prisma.derivativeFile.findFirst({
      where: {
        materialId: material.materialId,
        type: "THUMBNAIL",
        status: "READY",
        relativePath: thumbnailPath
      }
    });
    if (!thumbnail) throw new Error("没有找到对应 READY THUMBNAIL 记录。");
    if (!(await exists(storageService.resolve(thumbnail.relativePath)))) {
      throw new Error("READY THUMBNAIL 真实文件不存在，无法回填。");
    }
    await prisma.material.update({
      where: { id: material.id },
      data: { thumbnailPath: thumbnail.relativePath }
    });
    return "已回填 Material.thumbnailPath。";
  }

  if (issue.fixAction === "REBUILD_SEARCH_TEXT") {
    const material = await requireMaterialByIssue(issue);
    await prisma.material.update({
      where: { id: material.id },
      data: { searchText: buildSearchTextFromMaterial(material) }
    });
    return "已重建该素材 searchText。";
  }

  throw new Error("未知安全修复动作。");
}

async function requireMaterialByIssue(issue: StorageAuditIssue) {
  if (!issue.materialId) throw new Error("缺少 materialId，无法修复。");
  const material = await prisma.material.findUnique({ where: { materialId: issue.materialId } });
  if (!material) throw new Error("素材记录不存在，无法修复。");
  return material;
}

export async function rebuildSearchIndex() {
  const materials = await prisma.material.findMany();
  let updated = 0;
  for (const material of materials) {
    const searchText = buildSearchTextFromMaterial(material);
    await prisma.material.update({
      where: { id: material.id },
      data: { searchText }
    });
    updated += 1;
  }
  return { updated };
}

export async function rebuildMissingMetadata() {
  const materials = await prisma.material.findMany();
  let written = 0;
  for (const material of materials) {
    await storageService.writeMetadataJson(material);
    written += 1;
  }
  return { written };
}

export async function rebuildFromMetadata() {
  await storageService.initializeStorage();
  const files = await walkStorage(storageService.root);
  const metadataFiles = files.filter((file) => file.endsWith(".json") && file.includes(`${path.sep}metadata${path.sep}`));
  let created = 0;
  let skipped = 0;

  for (const relativePath of metadataFiles) {
    const payload = await readJson(storageService.resolve(relativePath));
    if (!payload || typeof payload.materialId !== "string") {
      skipped += 1;
      continue;
    }
    const existing = await prisma.material.findUnique({ where: { materialId: payload.materialId } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const storedRelativePath = typeof payload.relativePath === "string" ? payload.relativePath : "";
    if (!storedRelativePath || !(await exists(storageService.resolve(storedRelativePath)))) {
      skipped += 1;
      continue;
    }

    const createdMaterial = await prisma.material.create({
      data: {
        materialId: payload.materialId,
        assetType: asAssetType(payload.assetType),
        ingestSource: asSourceType(payload.ingestSource),
        originalFileName: String(payload.originalFileName || payload.storedFileName || path.basename(storedRelativePath)),
        storedFileName: String(payload.storedFileName || path.basename(storedRelativePath)),
        originalPath: String(payload.originalPath || storedRelativePath),
        relativePath: storedRelativePath,
        absolutePath: storageService.resolve(storedRelativePath),
        thumbnailPath: typeof payload.thumbnailPath === "string" ? payload.thumbnailPath : null,
        fileSize: byteSizeToBigInt(Number(payload.fileSize || 0)),
        mimeType: typeof payload.mimeType === "string" ? payload.mimeType : null,
        duration: numberOrNull(payload.duration),
        width: integerOrNull(payload.width),
        height: integerOrNull(payload.height),
        orientation: typeof payload.orientation === "string" ? payload.orientation : null,
        checksum: String(payload.checksum || `metadata:${payload.materialId}`),
        shooterId: typeof payload.shooterId === "string" ? payload.shooterId : null,
        shooterName: typeof payload.shooterName === "string" ? payload.shooterName : null,
        uploaderName: typeof payload.uploaderName === "string" ? payload.uploaderName : null,
        primaryCategory: String(payload.primaryCategory || path.dirname(storedRelativePath)),
        subject: stringOrNull(payload.subject),
        scene: stringOrNull(payload.scene),
        action: stringOrNull(payload.action),
        usage: stringOrNull(payload.usage),
        aiSummary: stringOrNull(payload.aiSummary),
        aiConfidence: numberOrNull(payload.aiConfidence),
        status: asMaterialStatus(payload.status),
        needsHumanReview: Boolean(payload.needsHumanReview),
        humanConfirmed: Boolean(payload.humanConfirmed),
        userSelectedRootCategory: stringOrNull(payload.userSelectedRootCategory),
        userSelectedSubCategory: stringOrNull(payload.userSelectedSubCategory),
        finalRootCategory: stringOrNull(payload.finalRootCategory),
        finalSubCategory: stringOrNull(payload.finalSubCategory),
        aiSuggestedRootCategory: stringOrNull(payload.aiSuggestedRootCategory),
        aiSuggestedSubCategory: stringOrNull(payload.aiSuggestedSubCategory),
        classificationConflict: Boolean(payload.classificationConflict),
        conflictReason: stringOrNull(payload.conflictReason),
        subjectType: stringOrNull(payload.subjectType),
        contentIntent: stringOrNull(payload.contentIntent),
        contentLongevity: stringOrNull(payload.contentLongevity),
        topicName: stringOrNull(payload.topicName),
        topicSuggestion: stringOrNull(payload.topicSuggestion),
        searchText: typeof payload.searchText === "string" ? payload.searchText : ""
      }
    });

    await prisma.material.update({
      where: { id: createdMaterial.id },
      data: { searchText: buildSearchTextFromMaterial(createdMaterial) }
    });
    created += 1;
  }

  return { created, skipped };
}

export async function regenerateMissingDerivatives(limit = DEFAULT_REGENERATE_DERIVATIVES_LIMIT) {
  await storageService.initializeStorage();
  const safeLimit = Math.min(Math.max(Math.trunc(limit) || DEFAULT_REGENERATE_DERIVATIVES_LIMIT, 1), 1000);
  const materials = await prisma.material.findMany({
    where: {
      status: { not: "TRASHED" }
    },
    include: {
      derivativeFiles: {
        where: {
          type: { in: ["THUMBNAIL", "PREVIEW_MP4"] },
          NOT: { status: "DELETED" }
        },
        orderBy: { updatedAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" }
  });

  const candidates: Material[] = [];
  for (const material of materials) {
    if (candidates.length >= safeLimit) break;
    if (await needsDerivativeRegeneration(material)) {
      candidates.push(material);
    }
  }

  let regenerated = 0;
  let skipped = 0;
  const failed: Array<{ materialId: string; fileName: string; message: string }> = [];
  const warnings: Array<{ materialId: string; message: string }> = [];

  for (const material of candidates) {
    try {
      const result = await ingestionPipeline.regenerateDerivativesForMaterial(material, {
        includeThumbnail: true,
        includeAiFrames: true,
        includePreview: true,
        operatorName: "系统修复",
        reason: "系统修复：重新生成缺失或失败的缩略图、AI 抽帧和 preview MP4。"
      });
      regenerated += 1;
      for (const warning of result.warnings) {
        warnings.push({ materialId: material.materialId, message: warning });
      }
    } catch (error) {
      failed.push({
        materialId: material.materialId,
        fileName: material.storedFileName,
        message: (error as Error).message || "重新生成失败。"
      });
    }
  }

  skipped = Math.max(0, materials.length - candidates.length);

  return {
    scanned: materials.length,
    candidates: candidates.length,
    regenerated,
    skipped,
    failed,
    warnings: warnings.slice(0, 50),
    message: `派生文件修复完成：扫描 ${materials.length} 个素材，需处理 ${candidates.length} 个，成功 ${regenerated} 个，失败 ${failed.length} 个。`
  };
}

async function needsDerivativeRegeneration(material: Material) {
  const absolutePath = storageService.resolve(material.relativePath);
  if (!(await exists(absolutePath))) return false;
  const thumbnailUsable = await hasUsableThumbnail(material);
  if (!thumbnailUsable) return true;
  if (isImageMaterial(material)) return false;
  const mediaInfo = await mediaService.readMediaInfo(absolutePath, material.mimeType);
  const profile = mediaService.getProcessingProfile({
    fileSize: byteSizeToSafeNumber(material.fileSize),
    mediaInfo
  });
  if (profile.skipPreviewMp4) return false;
  return !(await hasUsablePreviewMp4(material.materialId));
}

async function hasUsableThumbnail(material: Material) {
  if (material.thumbnailPath && await exists(storageService.resolve(material.thumbnailPath))) {
    return true;
  }
  const derivative = await derivativeService.findReadyThumbnail(material.materialId);
  return Boolean(derivative?.relativePath && await exists(storageService.resolve(derivative.relativePath)));
}

async function hasUsablePreviewMp4(materialId: string) {
  const derivative = await derivativeService.findReadyPreviewMp4(materialId);
  return Boolean(derivative?.relativePath && await exists(storageService.resolve(derivative.relativePath)));
}

function isImageMaterial(material: Material) {
  if (material.mimeType?.startsWith("image/")) return true;
  return [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(path.extname(material.relativePath).toLowerCase());
}

async function walkStorage(root: string, current = root): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      results.push(...await walkStorage(root, absolutePath));
    } else {
      results.push(path.relative(root, absolutePath));
    }
  }
  return results;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readJsonWithError(filePath: string): Promise<
  | { exists: false; ok: false; payload: null; error?: string }
  | { exists: true; ok: true; payload: Record<string, unknown>; error?: string }
  | { exists: true; ok: false; payload: null; error: string }
> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return {
      exists: true,
      ok: true,
      payload: JSON.parse(content) as Record<string, unknown>
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, ok: false, payload: null };
    }
    return {
      exists: true,
      ok: false,
      payload: null,
      error: (error as Error).message
    };
  }
}

function normalizeRelative(value: string) {
  return value.replaceAll("\\", "/");
}

function isDerivativePath(value: string) {
  return normalizeRelative(value).startsWith(`${DERIVATIVES_ROOT}/`);
}

function isProcessingTempFrame(value: string) {
  const normalized = normalizeRelative(value);
  return normalized.startsWith(`${PROCESSING_DIR}/`) &&
    /^frame_\d+\.(jpg|jpeg|png)$/i.test(path.posix.basename(normalized));
}

function buildProcessingTempFrameIssues(relativePaths: string[]): StorageAuditIssueDraft[] {
  const filesByDirectory = new Map<string, string[]>();
  for (const relativePath of relativePaths) {
    const directory = path.posix.dirname(normalizeRelative(relativePath));
    const files = filesByDirectory.get(directory) ?? [];
    files.push(normalizeRelative(relativePath));
    filesByDirectory.set(directory, files);
  }

  return Array.from(filesByDirectory.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([directory, files]) => {
      const sortedFiles = files.sort((left, right) => left.localeCompare(right));
      return {
        group: "PROCESSING_TEMP_FILE",
        type: "PROCESSING_TEMP_FRAME_LEFTOVER",
        severity: "warning",
        fileName: path.posix.basename(directory),
        relativePath: directory,
        message: "处理中目录存在历史临时抽帧文件；这不是素材主文件孤儿文件。",
        details: {
          frameCount: sortedFiles.length,
          sampleFiles: sortedFiles.slice(0, PROCESSING_TEMP_FRAME_SAMPLE_LIMIT)
        }
      };
    });
}

function jsonStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerOrNull(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function asAssetType(value: unknown): AssetType {
  if (
    value === "ACCOUNT_MATERIAL" ||
    value === "PRODUCT_MATERIAL" ||
    value === "REFERENCE_VIDEO" ||
    value === "PUBLIC_RESOURCE" ||
    value === "UNKNOWN"
  ) return value;
  return "UNKNOWN";
}

function asSourceType(value: unknown): SourceType {
  if (
    value === "WEB_MOBILE_UPLOAD" ||
    value === "WEB_DESKTOP_UPLOAD" ||
    value === "DEVICE_IMPORT" ||
    value === "MANUAL_IMPORT"
  ) return value;
  return "MANUAL_IMPORT";
}

function asMaterialStatus(value: unknown): MaterialStatus {
  if (
    value === "UPLOADED" ||
    value === "PROCESSING" ||
    value === "AI_TAGGED" ||
    value === "NEEDS_REVIEW" ||
    value === "IMPORTED" ||
    value === "READY" ||
    value === "TRASHED" ||
    value === "REJECTED" ||
    value === "FAILED"
  ) return value;
  return "NEEDS_REVIEW";
}

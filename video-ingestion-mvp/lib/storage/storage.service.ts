import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  Prisma,
  type AssetType,
  type Category,
  type DerivativeFile,
  type FileOperationLog,
  type Material,
  type OperationType,
  type SourceType
} from "@prisma/client";

import { getStorageRoot } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  FAILED_DIR,
  PENDING_DIRS,
  PROCESSING_DIR,
  STORAGE_DIRECTORIES,
  TRASH_DIR,
  UNSORTED_DIR,
  ASSET_TYPE_LABELS,
  getAllowedCategories,
  getAssetTypeForRootCategory,
  getFallbackCategory,
  getRootCategoryForDirectory,
  getSubCategoryLabelForDirectory,
  isBusinessCategoryForAsset,
  normalizeCategoryAlias
} from "@/lib/storage/storage.constants";

type JsonRecord = Record<string, unknown>;
type MetadataDerivative = Pick<
  DerivativeFile,
  | "type"
  | "status"
  | "relativePath"
  | "fileName"
  | "mimeType"
  | "fileSize"
  | "width"
  | "height"
  | "duration"
  | "frameIndex"
  | "timecodeMs"
  | "checksum"
  | "errorMessage"
  | "createdAt"
  | "updatedAt"
>;

export type AiFileNameParts = {
  uploaderName?: string | null;
  subject?: string | null;
  productName?: string | null;
  actionScene?: string | null;
  usage?: string | null;
  platform?: string | null;
  referenceType?: string | null;
  hookType?: string | null;
  resourceType?: string | null;
  keyword?: string | null;
  dataPoint?: string | null;
};

export type FileNameSuggestion = {
  assetType: AssetType;
  primaryCategory?: string;
  subjectType?: string | null;
  visualTags?: string[];
  contentIntent?: string | null;
  contentLongevity?: string | null;
  topicSuggestion?: string | null;
  topicName?: string | null;
  suggestedFileNameParts?: AiFileNameParts;
};

export type MoveResult = {
  storedFileName: string;
  relativePath: string;
  absolutePath: string;
  primaryCategory: string;
  thumbnailPath?: string | null;
};

function todayIdPart() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function tagsToSearchText(value: unknown): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map(String).join(" ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).map(tagsToSearchText).join(" ");
  return String(value);
}

export class StorageService {
  readonly root = getStorageRoot();

  async initializeStorage() {
    await fs.mkdir(this.root, { recursive: true });
    await Promise.all(STORAGE_DIRECTORIES.map((directory) => fs.mkdir(this.resolve(directory), {
      recursive: true
    })));
  }

  resolve(relativePath = "") {
    const resolved = path.resolve(this.root, relativePath);
    this.assertInsideRoot(resolved);
    return resolved;
  }

  toRelative(absolutePath: string) {
    const resolved = path.resolve(absolutePath);
    this.assertInsideRoot(resolved);
    return path.relative(this.root, resolved);
  }

  assertInsideRoot(absolutePath: string) {
    const rootWithSeparator = this.root.endsWith(path.sep) ? this.root : `${this.root}${path.sep}`;
    const resolved = path.resolve(absolutePath);
    if (resolved !== this.root && !resolved.startsWith(rootWithSeparator)) {
      throw new Error(`文件路径不在 STORAGE_ROOT 内：${resolved}`);
    }
  }

  async createBatchId(sourceType: SourceType) {
    return `${sourceType.replaceAll("_", "-")}-${todayIdPart()}-${randomUUID().slice(0, 8)}`;
  }

  async createIncomingPath(sourceType: SourceType, originalFileName: string) {
    const pendingDirectory = PENDING_DIRS[sourceType] ?? PENDING_DIRS.WEB_DESKTOP_UPLOAD;
    await fs.mkdir(this.resolve(pendingDirectory), { recursive: true });
    const safeName = this.sanitizeFileName(originalFileName || "upload.bin");
    const incomingName = `${Date.now()}_${randomUUID().slice(0, 8)}_${safeName}`;
    return this.getUniqueDestination(pendingDirectory, incomingName);
  }

  async createProcessingDirectory(batchId: string, sourceName: string) {
    const directoryName = this.sanitizeFileName(`${batchId}_${sourceName}`).slice(0, 120);
    const relativePath = path.join(PROCESSING_DIR, directoryName);
    await fs.mkdir(this.resolve(relativePath), { recursive: true });
    return relativePath;
  }

  async generateAssetId(assetType: AssetType) {
    const prefix = assetType === "REFERENCE_VIDEO" ? "REF" : "MAT";
    const datePart = todayIdPart();
    const idPrefix = `${prefix}${datePart}-`;
    const latest = await prisma.material.findFirst({
      where: { materialId: { startsWith: idPrefix } },
      orderBy: { materialId: "desc" },
      select: { materialId: true }
    });

    const latestNumber = latest?.materialId.split("-").at(-1);
    const next = latestNumber && /^\d+$/.test(latestNumber) ? Number(latestNumber) + 1 : 1;
    return `${idPrefix}${String(next).padStart(3, "0")}`;
  }

  sanitizeFileName(fileName: string) {
    const cleaned = fileName
      .normalize("NFKC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^\.+/, "")
      .replace(/[._\s-]+$/g, "");

    return cleaned || "untitled";
  }

  buildStandardFileName(
    id: string,
    suggestion: FileNameSuggestion,
    context: { uploaderName?: string | null; originalFileName: string },
    extension?: string
  ) {
    const ext = extension || path.extname(context.originalFileName) || ".mp4";
    const parts = suggestion.suggestedFileNameParts ?? {};
    const uploaderName = parts.uploaderName || context.uploaderName || "未命名";
    const subject = parts.subject || "待整理";
    const actionScene = parts.actionScene || "待整理";
    const usage = parts.usage || (suggestion.contentIntent === "HOOK" ? "开头钩子" : "待整理");
    let rawParts: string[];

    if (suggestion.assetType === "REFERENCE_VIDEO") {
      rawParts = [
        id,
        parts.platform || "平台待定",
        parts.referenceType || "对标",
        parts.hookType || parts.keyword || "待整理",
        parts.dataPoint || ""
      ];
    } else if (suggestion.assetType === "PRODUCT_MATERIAL") {
      rawParts = [
        id,
        "产品",
        uploaderName,
        parts.productName || "产品",
        actionScene || subject,
        usage
      ];
    } else if (suggestion.assetType === "PUBLIC_RESOURCE") {
      rawParts = [
        id,
        "公共",
        uploaderName,
        parts.resourceType || subject || "资源",
        usage
      ];
    } else {
      rawParts = [
        id,
        "账号",
        uploaderName,
        subject,
        actionScene,
        usage
      ];
    }

    const baseName = rawParts
      .map((part) => this.sanitizeFileName(String(part)).slice(0, 24))
      .filter(Boolean)
      .join("_")
      .slice(0, 120);

    return `${baseName}${ext.toLowerCase()}`;
  }

  buildSearchText(input: {
    materialId?: string | null;
    storedFileName?: string | null;
    originalFileName?: string | null;
    shooterName?: string | null;
    uploaderName?: string | null;
    primaryCategory?: string | null;
    finalRootCategory?: string | null;
    finalSubCategory?: string | null;
    aiSuggestedRootCategory?: string | null;
    aiSuggestedSubCategory?: string | null;
    subjectType?: string | null;
    subject?: string | null;
    scene?: string | null;
    action?: string | null;
    usage?: string | null;
    aiSummary?: string | null;
    contentIntent?: string | null;
    contentLongevity?: string | null;
    topicName?: string | null;
    topicSuggestion?: string | null;
    customTags?: unknown;
    humanTags?: unknown;
    visualTags?: unknown;
    aiEmotionTags?: unknown;
    aiUsageTags?: unknown;
    aiSceneTags?: unknown;
    aiSubjectTags?: unknown;
    aiActionTags?: unknown;
  }) {
    return [
      input.materialId,
      input.storedFileName,
      input.originalFileName,
      input.shooterName,
      input.uploaderName,
      input.primaryCategory,
      input.finalRootCategory,
      input.finalSubCategory,
      input.aiSuggestedRootCategory,
      input.aiSuggestedSubCategory,
      input.subjectType,
      input.subject,
      input.scene,
      input.action,
      input.usage,
      input.aiSummary,
      input.contentIntent,
      input.contentLongevity,
      input.topicName,
      input.topicSuggestion,
      tagsToSearchText(input.customTags),
      tagsToSearchText(input.humanTags),
      tagsToSearchText(input.visualTags),
      tagsToSearchText(input.aiEmotionTags),
      tagsToSearchText(input.aiUsageTags),
      tagsToSearchText(input.aiSceneTags),
      tagsToSearchText(input.aiSubjectTags),
      tagsToSearchText(input.aiActionTags)
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);
  }

  async refreshSearchText(material: Material) {
    const refreshed = await prisma.material.update({
      where: { id: material.id },
      data: {
        searchText: this.buildSearchText({
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
        })
      }
    });
    return refreshed;
  }

  normalizeRenamedFileName(materialId: string, desiredName: string, fallbackExtension: string) {
    const parsed = path.parse(desiredName);
    const extension = parsed.ext || fallbackExtension;
    const base = this.sanitizeFileName(parsed.name || desiredName);
    const baseWithId = base.startsWith(materialId) ? base : `${materialId}_${base}`;
    return `${baseWithId.slice(0, 120)}${extension.toLowerCase()}`;
  }

  async getUniqueDestination(relativeDirectory: string, fileName: string) {
    await fs.mkdir(this.resolve(relativeDirectory), { recursive: true });

    const parsed = path.parse(this.sanitizeFileName(fileName));
    const extension = parsed.ext;
    const baseName = parsed.name || "untitled";
    let candidate = `${baseName}${extension}`;
    let counter = 1;

    while (await exists(this.resolve(path.join(relativeDirectory, candidate)))) {
      candidate = `${baseName}_${counter}${extension}`;
      counter += 1;
    }

    return {
      fileName: candidate,
      relativePath: path.join(relativeDirectory, candidate),
      absolutePath: this.resolve(path.join(relativeDirectory, candidate))
    };
  }

  async safeMove(fromAbsolutePath: string, toAbsolutePath: string) {
    this.assertInsideRoot(fromAbsolutePath);
    this.assertInsideRoot(toAbsolutePath);
    await fs.mkdir(path.dirname(toAbsolutePath), { recursive: true });

    try {
      await fs.rename(fromAbsolutePath, toAbsolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      await fs.copyFile(fromAbsolutePath, toAbsolutePath);
      await fs.unlink(fromAbsolutePath);
    }
  }

  async moveRawFileToCategory(params: {
    fromAbsolutePath: string;
    targetCategory: string;
    storedFileName: string;
  }): Promise<MoveResult> {
    const destination = await this.getUniqueDestination(params.targetCategory, params.storedFileName);
    await this.safeMove(params.fromAbsolutePath, destination.absolutePath);
    return {
      storedFileName: destination.fileName,
      relativePath: destination.relativePath,
      absolutePath: destination.absolutePath,
      primaryCategory: params.targetCategory
    };
  }

  async moveThumbnailToCategory(params: {
    thumbnailAbsolutePath?: string | null;
    materialId: string;
    targetCategory: string;
  }) {
    if (!params.thumbnailAbsolutePath) return null;
    if (!(await exists(params.thumbnailAbsolutePath))) return null;

    const metadataDirectory = this.getMetadataDirectory(params.targetCategory);
    await fs.mkdir(this.resolve(metadataDirectory), { recursive: true });
    const destinationRelativePath = path.join(metadataDirectory, `${params.materialId}_thumb.jpg`);
    const destinationAbsolutePath = this.resolve(destinationRelativePath);
    await this.safeMove(params.thumbnailAbsolutePath, destinationAbsolutePath);
    return destinationRelativePath;
  }

  getMetadataDirectory(category: string) {
    return path.join(category, "metadata");
  }

  getMetadataRelativePath(category: string, materialId: string) {
    return path.join(this.getMetadataDirectory(category), `${materialId}.json`);
  }

  async writeMetadataJson(material: Material) {
    const metadataRelativePath = this.getMetadataRelativePath(
      this.metadataCategoryForMaterial(material),
      material.materialId
    );
    const metadataAbsolutePath = this.resolve(metadataRelativePath);
    const derivatives = await prisma.derivativeFile.findMany({
      where: {
        materialId: material.materialId,
        NOT: { status: "DELETED" }
      },
      orderBy: [
        { type: "asc" },
        { frameIndex: "asc" },
        { updatedAt: "desc" }
      ],
      select: {
        type: true,
        status: true,
        relativePath: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        width: true,
        height: true,
        duration: true,
        frameIndex: true,
        timecodeMs: true,
        checksum: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true
      }
    });
    await fs.mkdir(path.dirname(metadataAbsolutePath), { recursive: true });
    await fs.writeFile(metadataAbsolutePath, JSON.stringify(this.toMetadataPayload(material, derivatives), null, 2));
    return metadataRelativePath;
  }

  async removeMetadataJson(category: string, materialId: string) {
    await removeIfExists(this.resolve(this.getMetadataRelativePath(category, materialId)));
  }

  metadataCategoryForMaterial(material: Material) {
    if (material.status === "TRASHED") return TRASH_DIR;
    if (material.relativePath.startsWith(`${UNSORTED_DIR}${path.sep}`)) return UNSORTED_DIR;
    return material.primaryCategory || path.dirname(material.relativePath);
  }

  toMetadataPayload(material: Material, derivatives: MetadataDerivative[] = []) {
    const aiResult = (material.aiResult ?? {}) as JsonRecord;
    const suggested = ((aiResult.suggestedFileNameParts ?? {}) as JsonRecord) || {};
    const humanTags = (material.humanTags ?? {}) as JsonRecord;

    return {
      materialId: material.materialId,
      assetType: material.assetType,
      ingestSource: material.ingestSource,
      originalFileName: material.originalFileName,
      storedFileName: material.storedFileName,
      shooterId: material.shooterId,
      shooterName: material.shooterName,
      uploaderName: material.uploaderName,
      uploadTime: material.createdAt.toISOString(),
      fileSize: material.fileSize,
      mimeType: material.mimeType,
      duration: material.duration,
      width: material.width,
      height: material.height,
      orientation: material.orientation,
      checksum: material.checksum,
      categoryId: material.categoryId,
      userSelectedCategoryId: material.userSelectedCategoryId,
      aiSuggestedCategoryId: material.aiSuggestedCategoryId,
      finalCategoryId: material.finalCategoryId,
      categoryPath: material.categoryPath,
      categoryName: material.categoryName,
      primaryCategory: material.primaryCategory,
      userSelectedRootCategory: material.userSelectedRootCategory,
      userSelectedSubCategory: material.userSelectedSubCategory,
      finalRootCategory: material.finalRootCategory,
      finalSubCategory: material.finalSubCategory,
      aiSuggestedRootCategory: material.aiSuggestedRootCategory,
      aiSuggestedSubCategory: material.aiSuggestedSubCategory,
      classificationConflict: material.classificationConflict,
      customTags: material.customTags ?? [],
      subjectType: material.subjectType,
      visualTags: material.visualTags ?? aiResult.visualTags ?? [],
      contentIntent: material.contentIntent,
      contentLongevity: material.contentLongevity,
      topicName: material.topicName,
      topicSuggestion: material.topicSuggestion,
      searchText: material.searchText,
      aiEmotionTags: material.aiEmotionTags ?? aiResult.emotionTags ?? [],
      aiUsageTags: material.aiUsageTags ?? aiResult.usageTags ?? [],
      aiSceneTags: material.aiSceneTags ?? aiResult.sceneTags ?? [],
      aiSubjectTags: material.aiSubjectTags ?? aiResult.subjectTags ?? [],
      aiActionTags: material.aiActionTags ?? aiResult.actionTags ?? [],
      conflictReason: material.conflictReason,
      subject: material.subject ?? suggested.subject ?? null,
      scene: material.scene,
      action: material.action,
      usage: material.usage ?? suggested.usage ?? null,
      emotionTags: material.aiEmotionTags ?? aiResult.emotionTags ?? [],
      usageTags: material.aiUsageTags ?? aiResult.usageTags ?? [],
      contentTags: aiResult.contentTags ?? [],
      painPointTags: aiResult.painPointTags ?? [],
      structureTags: aiResult.structureTags ?? [],
      humanTags,
      aiSummary: material.aiSummary,
      aiConfidence: material.aiConfidence,
      needsHumanReview: material.needsHumanReview,
      humanConfirmed: material.humanConfirmed,
      relativePath: material.relativePath,
      thumbnailPath: material.thumbnailPath,
      derivatives: derivatives.map((derivative) => ({
        type: derivative.type,
        status: derivative.status,
        relativePath: derivative.relativePath,
        fileName: derivative.fileName,
        mimeType: derivative.mimeType,
        fileSize: derivative.fileSize,
        width: derivative.width,
        height: derivative.height,
        duration: derivative.duration,
        frameIndex: derivative.frameIndex,
        timecodeMs: derivative.timecodeMs,
        checksum: derivative.checksum,
        errorMessage: derivative.errorMessage,
        createdAt: derivative.createdAt.toISOString(),
        updatedAt: derivative.updatedAt.toISOString()
      })),
      status: material.status,
      createdAt: material.createdAt.toISOString(),
      updatedAt: material.updatedAt.toISOString()
    };
  }

  async renameMaterial(params: {
    material: Material;
    desiredFileName: string;
    operatorName?: string;
  }) {
    const material = params.material;
    const beforePath = material.relativePath;
    const beforeFileName = material.storedFileName;
    const currentDirectory = path.dirname(material.relativePath);
    const fallbackExtension = path.extname(material.storedFileName);
    const safeFileName = this.normalizeRenamedFileName(
      material.materialId,
      params.desiredFileName,
      fallbackExtension
    );
    const destination = await this.getUniqueDestination(currentDirectory, safeFileName);

    await this.safeMove(material.absolutePath, destination.absolutePath);

    const renamed = await prisma.material.update({
      where: { id: material.id },
      data: {
        storedFileName: destination.fileName,
        relativePath: destination.relativePath,
        absolutePath: destination.absolutePath
      }
    });
    const updated = await this.refreshSearchText(renamed);

    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: material.materialId,
      operationType: "RENAME",
      operatorName: params.operatorName,
      beforeFileName,
      afterFileName: updated.storedFileName,
      beforePath,
      afterPath: updated.relativePath
    });

    return updated;
  }

  async moveMaterial(params: {
    material: Material;
    targetAssetType: AssetType;
    targetCategory: string;
    targetCategoryRecord?: Pick<Category, "id" | "name" | "assetType" | "relativePath"> | null;
    categoryAssignmentSource?: "USER" | "AI";
    operatorName?: string;
    notes?: string;
  }) {
    const material = params.material;
    const beforePath = material.relativePath;
    const beforeFileName = material.storedFileName;
    const previousMetadataCategory = this.metadataCategoryForMaterial(material);
    const targetCategory = params.targetCategoryRecord?.relativePath || this.normalizeTargetCategory(params.targetAssetType, params.targetCategory);
    const targetAssetType = params.targetCategoryRecord?.assetType || params.targetAssetType;
    const dynamicCategoryData = params.targetCategoryRecord
      ? this.buildDynamicCategoryMoveData(params.targetCategoryRecord, material, params.categoryAssignmentSource || "USER")
      : {};
    const destination = await this.getUniqueDestination(targetCategory, material.storedFileName);

    await this.safeMove(material.absolutePath, destination.absolutePath);
    const thumbnailPath = await this.moveExistingThumbnail(material, targetCategory);
    const moved = await prisma.material.update({
      where: { id: material.id },
      data: {
        assetType: targetAssetType,
        primaryCategory: targetCategory,
        relativePath: destination.relativePath,
        absolutePath: destination.absolutePath,
        storedFileName: destination.fileName,
        thumbnailPath: thumbnailPath ?? material.thumbnailPath,
        status: params.targetCategoryRecord
          ? material.status === "TRASHED" ? "NEEDS_REVIEW" : "READY"
          : material.status === "TRASHED" ? "NEEDS_REVIEW" : material.status,
        ...dynamicCategoryData
      }
    });
    const updated = await this.refreshSearchText(moved);

    if (previousMetadataCategory !== this.metadataCategoryForMaterial(updated)) {
      await this.removeMetadataJson(previousMetadataCategory, material.materialId);
    }
    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: material.materialId,
      operationType: "MOVE",
      operatorName: params.operatorName,
      beforeFileName,
      afterFileName: updated.storedFileName,
      beforePath,
      afterPath: updated.relativePath,
      notes: params.notes
    });

    return updated;
  }

  buildDynamicCategoryMoveData(
    category: Pick<Category, "id" | "name" | "assetType" | "relativePath">,
    material: Material,
    source: "USER" | "AI" = "USER"
  ): Prisma.MaterialUpdateInput {
    const rootSub = this.directoryToLegacyCategoryFields(category.relativePath);
    return {
      category: { connect: { id: category.id } },
      finalCategory: { connect: { id: category.id } },
      ...(source === "USER" ? { userSelectedCategory: { connect: { id: category.id } } } : {}),
      categoryPath: category.relativePath,
      categoryName: category.name,
      finalRootCategory: rootSub.rootLabel,
      finalSubCategory: category.name || rootSub.subCategory,
      ...(source === "USER"
        ? {
            userSelectedRootCategory: rootSub.rootCategory,
            userSelectedSubCategory: category.name || rootSub.subCategory
          }
        : {}),
      classificationConflict: false,
      conflictReason: null,
      needsHumanReview: false,
      humanConfirmed: true,
      searchText: material.searchText
    };
  }

  directoryToLegacyCategoryFields(directory?: string | null) {
    const rootCategory = getRootCategoryForDirectory(directory);
    const assetType = getAssetTypeForRootCategory(rootCategory);
    return {
      rootCategory,
      rootLabel: rootCategory === "AUTO" ? "待整理" : ASSET_TYPE_LABELS[assetType],
      subCategory: getSubCategoryLabelForDirectory(directory),
      directory: directory || ""
    };
  }

  async moveExistingThumbnail(material: Material, targetCategory: string) {
    if (!material.thumbnailPath) return null;
    if (material.thumbnailPath.startsWith(`_derivatives${path.sep}`)) return material.thumbnailPath;
    const source = this.resolve(material.thumbnailPath);
    if (!(await exists(source))) return null;
    const metadataDirectory = this.getMetadataDirectory(targetCategory);
    await fs.mkdir(this.resolve(metadataDirectory), { recursive: true });
    const destinationRelativePath = path.join(metadataDirectory, `${material.materialId}_thumb.jpg`);
    const destination = this.resolve(destinationRelativePath);
    if (source === destination) return material.thumbnailPath;
    await this.safeMove(source, destination);
    return destinationRelativePath;
  }

  normalizeTargetCategory(assetType: AssetType, requestedCategory: string) {
    const normalizedCategory = normalizeCategoryAlias(requestedCategory);
    if (assetType === "UNKNOWN") return UNSORTED_DIR;
    if (isBusinessCategoryForAsset(assetType, normalizedCategory)) return normalizedCategory;
    return getFallbackCategory(assetType);
  }

  async confirmMaterial(params: { material: Material; operatorName?: string }) {
    const relativeDirectory = path.dirname(params.material.relativePath);
    const primaryCategory = isBusinessCategoryForAsset(params.material.assetType, params.material.primaryCategory)
      ? params.material.primaryCategory
      : isBusinessCategoryForAsset(params.material.assetType, relativeDirectory)
        ? relativeDirectory
        : getFallbackCategory(params.material.assetType);
    const confirmed = await prisma.material.update({
      where: { id: params.material.id },
      data: {
        primaryCategory,
        humanConfirmed: true,
        needsHumanReview: false,
        classificationConflict: false,
        conflictReason: null,
        status: params.material.status === "TRASHED" ? "TRASHED" : "READY"
      }
    });
    const updated = await this.refreshSearchText(confirmed);
    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: params.material.materialId,
      operationType: "EDIT_TAGS",
      operatorName: params.operatorName,
      beforePath: params.material.relativePath,
      afterPath: updated.relativePath,
      notes: "确认当前素材入库"
    });
    return updated;
  }

  async updateHumanTags(params: {
    material: Material;
    humanTags: unknown;
    subject?: string | null;
    scene?: string | null;
    action?: string | null;
    usage?: string | null;
    notes?: string | null;
    humanConfirmed?: boolean;
    operatorName?: string;
  }) {
    const tagged = await prisma.material.update({
      where: { id: params.material.id },
      data: {
        humanTags:
          params.humanTags === undefined
            ? undefined
            : params.humanTags === null
              ? Prisma.JsonNull
              : (params.humanTags as Prisma.InputJsonValue),
        subject: params.subject,
        scene: params.scene,
        action: params.action,
        usage: params.usage,
        notes: params.notes,
        humanConfirmed: params.humanConfirmed ?? params.material.humanConfirmed,
        needsHumanReview:
          params.humanConfirmed === true ? false : params.material.needsHumanReview,
        status:
          params.humanConfirmed === true && params.material.status === "NEEDS_REVIEW"
            ? "READY"
            : params.material.status
      }
    });
    const updated = await this.refreshSearchText(tagged);

    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: params.material.materialId,
      operationType: "EDIT_TAGS",
      operatorName: params.operatorName,
      beforePath: params.material.relativePath,
      afterPath: updated.relativePath
    });

    return updated;
  }

  async deleteToTrash(params: { material: Material; operatorName?: string; notes?: string }) {
    const material = params.material;
    const beforeMetadataCategory = this.metadataCategoryForMaterial(material);
    const destination = await this.getUniqueDestination(TRASH_DIR, material.storedFileName);
    await this.safeMove(material.absolutePath, destination.absolutePath);

    const thumbnailPath = await this.moveExistingThumbnail(material, TRASH_DIR);
    const trashed = await prisma.material.update({
      where: { id: material.id },
      data: {
        relativePath: destination.relativePath,
        absolutePath: destination.absolutePath,
        storedFileName: destination.fileName,
        thumbnailPath: thumbnailPath ?? material.thumbnailPath,
        status: "TRASHED"
      }
    });
    const updated = await this.refreshSearchText(trashed);

    await this.removeMetadataJson(beforeMetadataCategory, material.materialId);
    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: material.materialId,
      operationType: "DELETE_TO_TRASH",
      operatorName: params.operatorName,
      beforeFileName: material.storedFileName,
      afterFileName: updated.storedFileName,
      beforePath: material.relativePath,
      afterPath: updated.relativePath,
      notes: params.notes
    });

    return updated;
  }

  async restoreFromTrash(params: {
    material: Material;
    targetCategory?: string;
    operatorName?: string;
  }) {
    const material = params.material;
    const previousDelete = await prisma.fileOperationLog.findFirst({
      where: { materialId: material.materialId, operationType: "DELETE_TO_TRASH" },
      orderBy: { createdAt: "desc" }
    });
    const restoredCategory =
      params.targetCategory ||
      (previousDelete?.beforePath ? path.dirname(previousDelete.beforePath) : material.primaryCategory) ||
      getFallbackCategory(material.assetType);
    const targetCategory = this.normalizeTargetCategory(material.assetType, restoredCategory);
    const beforeMetadataCategory = this.metadataCategoryForMaterial(material);
    const destination = await this.getUniqueDestination(targetCategory, material.storedFileName);

    await this.safeMove(material.absolutePath, destination.absolutePath);
    const thumbnailPath = await this.moveExistingThumbnail(material, targetCategory);
    const restored = await prisma.material.update({
      where: { id: material.id },
      data: {
        primaryCategory: targetCategory,
        relativePath: destination.relativePath,
        absolutePath: destination.absolutePath,
        storedFileName: destination.fileName,
        thumbnailPath: thumbnailPath ?? material.thumbnailPath,
        status: material.needsHumanReview ? "NEEDS_REVIEW" : "READY"
      }
    });
    const updated = await this.refreshSearchText(restored);

    await this.removeMetadataJson(beforeMetadataCategory, material.materialId);
    await this.writeMetadataJson(updated);
    await this.logOperation({
      materialId: material.materialId,
      operationType: "RESTORE",
      operatorName: params.operatorName,
      beforeFileName: material.storedFileName,
      afterFileName: updated.storedFileName,
      beforePath: material.relativePath,
      afterPath: updated.relativePath
    });

    return updated;
  }

  async logOperation(data: {
    materialId: string;
    operationType: OperationType;
    operatorName?: string | null;
    beforeFileName?: string | null;
    afterFileName?: string | null;
    beforePath?: string | null;
    afterPath?: string | null;
    notes?: string | null;
  }): Promise<FileOperationLog> {
    return prisma.fileOperationLog.create({ data });
  }

  async getDownloadPath(material: Material) {
    const absolutePath = this.resolve(material.relativePath);
    if (!(await exists(absolutePath))) {
      throw new Error("素材文件不存在，可能被人工移动或删除。");
    }
    return absolutePath;
  }

  async getAllowedMoveCategories(assetType: AssetType) {
    return getAllowedCategories(assetType);
  }

  async moveFailedFile(fromAbsolutePath: string, desiredName: string) {
    const destination = await this.getUniqueDestination(FAILED_DIR, desiredName);
    if (await exists(fromAbsolutePath)) {
      await this.safeMove(fromAbsolutePath, destination.absolutePath);
    }
    return destination;
  }
}

export const storageService = new StorageService();

import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, type Category, type Material, type SourceType } from "@prisma/client";

import { derivativeService } from "@/lib/media/derivative.service";
import { mediaService } from "@/lib/media/media.service";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";
import { aiAnalysisJobService } from "@/modules/ai/ai-analysis-job.service";
import { AiClassificationSchema, materialClassifierService } from "@/modules/ai/material-classifier.service";
import { directoryToRootAndSub, normalizeIngestIntent, type IngestIntent } from "@/modules/ingestion/ingest-taxonomy";
import { decideIngestionTarget, type RuleDecision } from "@/modules/ingestion/rule-engine";

export type ManualAssetType = "AUTO" | "ACCOUNT_MATERIAL" | "PRODUCT_MATERIAL" | "REFERENCE_VIDEO" | "PUBLIC_RESOURCE";

export type IngestFileInput = {
  batchId: string;
  sourceType: SourceType;
  incomingAbsolutePath: string;
  originalFileName: string;
  fileSize: number;
  mimeType?: string | null;
  uploaderName?: string | null;
  shooterId?: string | null;
  shooterName?: string | null;
  categoryId?: string | null;
  userSelectedCategoryId?: string | null;
  rootCategory?: string | null;
  subCategory?: string | null;
  customTags?: string[];
  notes?: string | null;
  manualAssetType?: ManualAssetType;
};

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
  ".webp",
  ".heic",
  ".heif"
]);

const DEVICE_IMPORTING_FILE = "_IMPORTING.txt";

export class IngestionPipeline {
  async ingestFile(input: IngestFileInput) {
    await storageService.initializeStorage();
    let workingPath = input.incomingAbsolutePath;
    const workspaceContext = await getDefaultWorkspaceContext();

    try {
      await prisma.importBatch.update({
        where: { batchId: input.batchId },
        data: { status: "PROCESSING" }
      });

      const checksum = await mediaService.calculateChecksum(workingPath);
      const mediaInfo = await mediaService.readMediaInfo(workingPath, input.mimeType);
      const processingRelativeDirectory = await storageService.createProcessingDirectory(
        input.batchId,
        input.originalFileName
      );
      const processingAbsoluteDirectory = storageService.resolve(processingRelativeDirectory);
      const frameResult = await mediaService.extractKeyFrames({
        filePath: workingPath,
        mediaInfo,
        outputDirectory: processingAbsoluteDirectory
      });
      const selectedCategory = await this.resolveSelectedCategory(input.categoryId || input.userSelectedCategoryId);
      const categoryOptions = await this.listUploadableLeafCategoryOptions();
      const ingestIntent = normalizeIngestIntent({
        shooterId: input.shooterId,
        shooterName: input.shooterName || input.uploaderName,
        selectedCategory,
        rootCategory: input.rootCategory as IngestIntent["rootCategory"],
        subCategory: input.subCategory || undefined,
        customTags: input.customTags || [],
        notes: input.notes
      });

      const ai = await materialClassifierService.classifyMaterial(frameResult.frames, {
        originalFileName: input.originalFileName,
        uploaderName: input.uploaderName,
        shooterName: ingestIntent.shooterName,
        userSelectedRootCategory: ingestIntent.selectedRootLabel,
        userSelectedSubCategory: ingestIntent.selectedSubLabel,
        customTags: ingestIntent.customTags,
        notes: input.notes,
        manualAssetType: input.manualAssetType,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        duration: mediaInfo.duration,
        width: mediaInfo.width,
        height: mediaInfo.height,
        orientation: mediaInfo.orientation,
        categoryOptions
      });
      const aiSuggestedCategory = await this.resolveAiSuggestedCategory(ai.classification.suggestedCategoryId);
      const aiSuggestedCategoryWarning = ai.classification.suggestedCategoryId && !aiSuggestedCategory
        ? `AI suggestedCategoryId 无效或不可上传：${ai.classification.suggestedCategoryId}`
        : "";
      const baseRuleDecision = decideIngestionTarget(ai.classification, ingestIntent);
      const categoryDecision = this.applyAiCategoryDecision({
        decision: baseRuleDecision,
        selectedCategory,
        aiSuggestedCategory
      });
      const decision = categoryDecision.decision;
      const finalCategory = categoryDecision.finalCategory
        || (selectedCategory?.relativePath === decision.targetCategory
          ? selectedCategory
          : await this.resolveCategoryByPath(decision.targetCategory));
      const finalCategoryId = finalCategory?.id || null;
      const finalCategoryPath = finalCategory?.relativePath || decision.targetCategory;
      const finalCategoryName = finalCategory?.name || decision.finalSubCategory || decision.finalRootCategory;
      const materialId = await storageService.generateAssetId(decision.assetType);
      const storedFileName = storageService.buildStandardFileName(
        materialId,
        ai.classification,
        {
          uploaderName: ingestIntent.shooterName || input.uploaderName,
          originalFileName: input.originalFileName
        },
        path.extname(input.originalFileName)
      );
      const moved = await storageService.moveRawFileToCategory({
        fromAbsolutePath: workingPath,
        targetCategory: decision.targetCategory,
        storedFileName
      });
      workingPath = moved.absolutePath;

      const warnings = [
        ...mediaInfo.warnings,
        ...frameResult.warnings,
        ...ai.warnings,
        aiSuggestedCategoryWarning
      ].filter(Boolean);
      const aiResult = {
        ...ai.classification,
        _requestedProvider: ai.requestedProvider,
        _provider: ai.provider,
        _usedFallback: ai.usedFallback,
        _diagnostics: ai.diagnostics,
        _categorySuggestion: {
          suggestedCategoryId: ai.classification.suggestedCategoryId || "",
          valid: Boolean(aiSuggestedCategory),
          materialFieldWritten: Boolean(aiSuggestedCategory),
          usedForFinalCategory: categoryDecision.usedForFinalCategory,
          warning: aiSuggestedCategoryWarning || null
        },
        _baseRuleDecision: baseRuleDecision,
        _ruleDecision: decision,
        _warnings: warnings
      };
      const searchText = storageService.buildSearchText({
        materialId,
        storedFileName: moved.storedFileName,
        originalFileName: input.originalFileName,
        shooterName: ingestIntent.shooterName,
        uploaderName: input.uploaderName,
        primaryCategory: moved.primaryCategory,
        finalRootCategory: decision.finalRootCategory,
        finalSubCategory: decision.finalSubCategory,
        aiSuggestedRootCategory: decision.aiSuggestedRootCategory,
        aiSuggestedSubCategory: decision.aiSuggestedSubCategory,
        subjectType: ai.classification.subjectType,
        subject: ai.classification.subject,
        scene: ai.classification.scene,
        action: ai.classification.action,
        usage: ai.classification.usage,
        aiSummary: ai.classification.summary,
        contentIntent: ai.classification.contentIntent,
        contentLongevity: ai.classification.contentLongevity,
        topicName: ai.classification.topicName,
        topicSuggestion: ai.classification.topicSuggestion,
        customTags: ingestIntent.customTags,
        humanTags: {},
        visualTags: ai.classification.visualTags,
        aiEmotionTags: ai.classification.emotionTags,
        aiUsageTags: ai.classification.usageTags,
        aiSceneTags: ai.classification.sceneTags,
        aiSubjectTags: ai.classification.subjectTags,
        aiActionTags: ai.classification.actionTags
      });

      const material = await prisma.material.create({
        data: {
          workspaceId: workspaceContext.workspaceId,
          storageProviderId: workspaceContext.storageProviderId,
          materialId,
          batchId: input.batchId,
          assetType: decision.assetType,
          ingestSource: input.sourceType,
          originalFileName: input.originalFileName,
          storedFileName: moved.storedFileName,
          originalPath: storageService.toRelative(input.incomingAbsolutePath),
          relativePath: moved.relativePath,
          absolutePath: moved.absolutePath,
          thumbnailPath: null,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          duration: mediaInfo.duration,
          width: mediaInfo.width,
          height: mediaInfo.height,
          orientation: mediaInfo.orientation,
          checksum,
          shooterId: ingestIntent.shooterId || null,
          shooterName: ingestIntent.shooterName,
          uploaderName: input.uploaderName,
          categoryId: finalCategoryId,
          userSelectedCategoryId: selectedCategory?.id || null,
          finalCategoryId,
          categoryPath: finalCategoryPath,
          categoryName: finalCategoryName,
          userSelectedRootCategory: ingestIntent.rootCategory,
          userSelectedSubCategory: ingestIntent.selectedSubLabel,
          finalRootCategory: decision.finalRootCategory,
          finalSubCategory: decision.finalSubCategory,
          aiSuggestedCategoryId: aiSuggestedCategory?.id || null,
          aiSuggestedRootCategory: decision.aiSuggestedRootCategory,
          aiSuggestedSubCategory: decision.aiSuggestedSubCategory,
          classificationConflict: decision.classificationConflict,
          customTags: ingestIntent.customTags,
          subjectType: ai.classification.subjectType ?? "UNKNOWN",
          visualTags: ai.classification.visualTags ?? [],
          contentIntent: ai.classification.contentIntent ?? "UNKNOWN",
          contentLongevity: ai.classification.contentLongevity ?? "UNKNOWN",
          topicName: ai.classification.topicName || null,
          topicSuggestion: ai.classification.topicSuggestion || null,
          searchText,
          aiEmotionTags: ai.classification.emotionTags ?? [],
          aiUsageTags: ai.classification.usageTags ?? [],
          aiSceneTags: ai.classification.sceneTags ?? [],
          aiSubjectTags: ai.classification.subjectTags ?? [],
          aiActionTags: ai.classification.actionTags ?? [],
          conflictReason: decision.conflictReason,
          primaryCategory: moved.primaryCategory,
          subject: ai.classification.subject ?? null,
          scene: ai.classification.scene ?? null,
          action: ai.classification.action ?? null,
          usage: ai.classification.usage ?? null,
          aiResult,
          aiSummary: ai.classification.summary,
          aiConfidence: ai.classification.confidence,
          humanTags: {},
          humanConfirmed: decision.humanConfirmed,
          needsHumanReview: decision.needsHumanReview,
          status: decision.status,
          notes: input.notes
        }
      });

      const thumbnail = await derivativeService.generateThumbnailForMaterial({
        material,
        mediaInfo
      });
      warnings.push(...thumbnail.warnings.filter(Boolean));
      const aiFrames = await derivativeService.saveAiFramesForMaterial({
        material,
        framePaths: frameResult.frames
      });
      warnings.push(...aiFrames.warnings.filter(Boolean));
      const readyAiFramePaths = aiFrames.derivatives
        .filter((derivative) => derivative.status === "READY")
        .map((derivative) => derivative.relativePath);
      await aiAnalysisJobService.createForClassifierResult({
        material,
        ai,
        inputFramePaths: readyAiFramePaths.length
          ? readyAiFramePaths
          : frameResult.frames.map((framePath) => storageService.toRelative(framePath)),
        inputMetadata: {
          source: "ingest",
          originalFrameCount: frameResult.frames.length,
          standardizedAiFrameCount: readyAiFramePaths.length,
          usedStandardizedAiFrames: readyAiFramePaths.length > 0
        },
        outputResult: aiResult
      });
      const preview = await derivativeService.generatePreviewMp4ForMaterial({
        material,
        mediaInfo
      });
      warnings.push(...preview.warnings.filter(Boolean));
      const materialWithThumbnail = thumbnail.thumbnailPath
        ? await prisma.material.update({
            where: { id: material.id },
            data: { thumbnailPath: thumbnail.thumbnailPath }
          })
        : material;

      await storageService.logOperation({
        materialId,
        operationType: "UPLOAD",
        operatorName: input.uploaderName,
        afterFileName: materialWithThumbnail.storedFileName,
        afterPath: materialWithThumbnail.relativePath,
        notes: `来源：${input.sourceType}`
      });
      await storageService.logOperation({
        materialId,
        operationType: "AI_CLASSIFY",
        operatorName: "AI",
        afterFileName: materialWithThumbnail.storedFileName,
        afterPath: materialWithThumbnail.relativePath,
        notes: `${decision.reason}${warnings.length ? ` warnings: ${warnings.join(" | ")}` : ""}`
      });
      await storageService.writeMetadataJson(materialWithThumbnail);
      await this.finalizeBatch(input.batchId);

      return materialWithThumbnail;
    } catch (error) {
      await this.handleFailure(input, workingPath, error as Error);
      await this.finalizeBatch(input.batchId);
      throw error;
    }
  }

  async handleFailure(input: IngestFileInput, currentPath: string, error: Error) {
    const workspaceContext = await getDefaultWorkspaceContext();
    const materialId = await storageService.generateAssetId("UNKNOWN");
    const failed = await storageService.moveFailedFile(currentPath, input.originalFileName);
    const checksum = await mediaService.calculateChecksum(failed.absolutePath).catch(() => "sha256:failed");
    const searchText = storageService.buildSearchText({
      materialId,
      storedFileName: failed.fileName,
      originalFileName: input.originalFileName,
      uploaderName: input.uploaderName,
      primaryCategory: "01_待导入/失败",
      subjectType: "UNKNOWN",
      subject: "待整理",
      aiSummary: "入库失败，等待人工处理。",
      contentIntent: "UNKNOWN",
      contentLongevity: "UNKNOWN",
      customTags: input.customTags || [],
      visualTags: [],
      aiEmotionTags: [],
      aiUsageTags: []
    });
    const material = await prisma.material.create({
      data: {
        workspaceId: workspaceContext.workspaceId,
        storageProviderId: workspaceContext.storageProviderId,
        materialId,
        batchId: input.batchId,
        assetType: "UNKNOWN",
        ingestSource: input.sourceType,
        originalFileName: input.originalFileName,
        storedFileName: failed.fileName,
        originalPath: storageService.toRelative(input.incomingAbsolutePath),
        relativePath: failed.relativePath,
        absolutePath: failed.absolutePath,
        thumbnailPath: null,
        fileSize: input.fileSize,
        mimeType: input.mimeType,
        duration: null,
        width: null,
        height: null,
        orientation: "unknown",
        checksum,
        uploaderName: input.uploaderName,
        primaryCategory: "01_待导入/失败",
        subjectType: "UNKNOWN",
        visualTags: [],
        contentIntent: "UNKNOWN",
        contentLongevity: "UNKNOWN",
        searchText,
        subject: "待整理",
        scene: null,
        action: null,
        usage: null,
        aiResult: { error: error.message },
        aiSummary: "入库失败，等待人工处理。",
        aiConfidence: 0,
        humanTags: {},
        humanConfirmed: false,
        needsHumanReview: true,
        status: "FAILED",
        notes: input.notes
      }
    });

    await storageService.logOperation({
      materialId,
      operationType: "UPLOAD",
      operatorName: input.uploaderName,
      afterFileName: material.storedFileName,
      afterPath: material.relativePath,
      notes: `入库失败：${error.message}`
    });
    await storageService.writeMetadataJson(material);
  }

  private async resolveSelectedCategory(categoryId?: string | null) {
    if (!categoryId) return null;
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { children: true } } }
    });
    if (!category) throw new Error("选择的栏目不存在，请刷新后重新选择。");
    if (category.status !== "ACTIVE") throw new Error(`栏目「${category.name}」已停用，不能上传。`);
    if (!category.allowUpload) throw new Error(`栏目「${category.name}」不允许上传。`);
    if (category._count.children > 0) throw new Error(`请选择「${category.name}」下的具体子栏目。`);
    if (!category.relativePath) throw new Error(`栏目「${category.name}」没有绑定真实目录。`);
    return category;
  }

  private async resolveCategoryByPath(relativePath?: string | null): Promise<Category | null> {
    if (!relativePath) return null;
    return prisma.category.findFirst({
      where: {
        relativePath,
        NOT: { status: "DELETED" }
      }
    });
  }

  private async listUploadableLeafCategoryOptions() {
    const categories = await prisma.category.findMany({
      where: {
        status: "ACTIVE",
        allowUpload: true,
        NOT: { relativePath: null }
      },
      include: {
        children: {
          where: {
            NOT: { status: "DELETED" }
          },
          select: { id: true }
        }
      },
      orderBy: [
        { depth: "asc" },
        { sortOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    return categories
      .filter((category) => category.children.length === 0 && category.relativePath)
      .map((category) => ({
        id: category.id,
        name: category.name,
        relativePath: category.relativePath as string,
        assetType: category.assetType,
        aiDescription: category.aiDescription
      }));
  }

  private async resolveAiSuggestedCategory(categoryId?: string | null) {
    const normalizedCategoryId = categoryId?.trim();
    if (!normalizedCategoryId) return null;

    const category = await prisma.category.findUnique({
      where: { id: normalizedCategoryId },
      include: {
        children: {
          where: {
            NOT: { status: "DELETED" }
          },
          select: { id: true }
        }
      }
    });

    if (!category) return null;
    if (category.status !== "ACTIVE") return null;
    if (!category.allowUpload) return null;
    if (!category.relativePath) return null;
    if (category.children.length > 0) return null;
    return category;
  }

  private applyAiCategoryDecision(params: {
    decision: RuleDecision;
    selectedCategory: Category | null;
    aiSuggestedCategory: Category | null;
  }) {
    const { decision, selectedCategory, aiSuggestedCategory } = params;

    if (selectedCategory) {
      if (!aiSuggestedCategory || aiSuggestedCategory.id === selectedCategory.id) {
        return {
          decision,
          finalCategory: selectedCategory,
          usedForFinalCategory: false
        };
      }

      const conflictReason =
        `人工选择栏目为「${selectedCategory.name}」（${selectedCategory.relativePath || "未绑定目录"}），` +
        `AI 建议栏目为「${aiSuggestedCategory.name}」（${aiSuggestedCategory.relativePath || "未绑定目录"}）。已保留人工选择。`;

      return {
        decision: {
          ...decision,
          classificationConflict: true,
          conflictReason,
          needsHumanReview: true,
          status: "NEEDS_REVIEW" as const,
          reason: `${decision.reason} ${conflictReason}`
        },
        finalCategory: selectedCategory,
        usedForFinalCategory: false
      };
    }

    if (!aiSuggestedCategory?.relativePath) {
      return {
        decision,
        finalCategory: null,
        usedForFinalCategory: false
      };
    }

    const finalRootSub = directoryToRootAndSub(aiSuggestedCategory.relativePath);
    return {
      decision: {
        ...decision,
        assetType: aiSuggestedCategory.assetType,
        targetCategory: aiSuggestedCategory.relativePath,
        finalRootCategory: finalRootSub.rootLabel,
        finalSubCategory: finalRootSub.subCategory || aiSuggestedCategory.name,
        reason: `${decision.reason} 用户未选择栏目，使用有效 AI suggestedCategoryId 对应栏目「${aiSuggestedCategory.name}」。`
      },
      finalCategory: aiSuggestedCategory,
      usedForFinalCategory: true
    };
  }

  async finalizeBatch(batchId: string) {
    const [batch, materials, jobs] = await Promise.all([
      prisma.importBatch.findUnique({ where: { batchId } }),
      prisma.material.findMany({ where: { batchId } }),
      prisma.ingestionJob.findMany({ where: { batchId } }).catch(() => [])
    ]);
    if (materials.length === 0 && jobs.length === 0) return;
    const activeJobs = jobs.filter((job) => ["QUEUED", "RUNNING"].includes(job.status)).length;
    const succeededJobs = jobs.filter((job) => job.status === "SUCCEEDED").length;
    const failedJobs = jobs.filter((job) => job.status === "FAILED").length;
    const failed = materials.filter((material) => material.status === "FAILED").length;
    const needsReview = materials.filter((material) => material.status === "NEEDS_REVIEW").length;
    const imported = materials.filter((material) => ["READY", "IMPORTED"].includes(material.status)).length;
    const missingFiles = batch ? Math.max(0, batch.fileCount - Math.max(jobs.length, materials.length)) : 0;
    const successfulMaterials = imported + needsReview;
    const hasSuccessfulOutcome = succeededJobs > 0 || successfulMaterials > 0;
    const allJobsFailed = jobs.length > 0 && failedJobs === jobs.length && !hasSuccessfulOutcome;
    const allMaterialsFailed = materials.length > 0 && failed === materials.length && !hasSuccessfulOutcome;

    await prisma.importBatch.update({
      where: { batchId },
      data: {
        status:
          activeJobs > 0
            ? "PROCESSING"
            : allJobsFailed
              ? "FAILED"
              : allMaterialsFailed
            ? "FAILED"
            : failedJobs > 0 || failed > 0 || missingFiles > 0
              ? "PARTIAL_FAILED"
              : needsReview > 0
                ? "NEEDS_REVIEW"
                : jobs.length > 0 && succeededJobs === jobs.length
                  ? "IMPORTED"
                : materials.length > 0 && imported === materials.length
                  ? "IMPORTED"
                  : "PROCESSING"
      }
    });
  }

  async reanalyzeMaterial(material: Material) {
    const mediaInfo = await mediaService.readMediaInfo(material.absolutePath, material.mimeType);
    const processingRelativeDirectory = await storageService.createProcessingDirectory(
      `REANALYZE-${material.materialId}`,
      material.originalFileName
    );
    const frameResult = await mediaService.extractKeyFrames({
      filePath: material.absolutePath,
      mediaInfo,
      outputDirectory: storageService.resolve(processingRelativeDirectory)
    });
    const ingestIntent = normalizeIngestIntent({
      shooterId: material.shooterId,
      shooterName: material.shooterName || material.uploaderName,
      rootCategory: material.userSelectedRootCategory as IngestIntent["rootCategory"],
      subCategory: material.userSelectedSubCategory || undefined,
      customTags: Array.isArray(material.customTags) ? material.customTags.map(String) : [],
      notes: material.notes
    });
    const categoryOptions = await this.listUploadableLeafCategoryOptions();
    const ai = await materialClassifierService.classifyMaterial(frameResult.frames, {
      originalFileName: material.originalFileName,
      uploaderName: material.uploaderName,
      shooterName: material.shooterName || material.uploaderName,
      userSelectedRootCategory: material.finalRootCategory || material.userSelectedRootCategory,
      userSelectedSubCategory: material.finalSubCategory || material.userSelectedSubCategory,
      customTags: ingestIntent.customTags,
      notes: material.notes,
      fileSize: material.fileSize,
      mimeType: material.mimeType,
      duration: mediaInfo.duration,
      width: mediaInfo.width,
      height: mediaInfo.height,
      orientation: mediaInfo.orientation,
      categoryOptions
    });
    const aiSuggestedCategory = await this.resolveAiSuggestedCategory(ai.classification.suggestedCategoryId);
    const aiSuggestedCategoryWarning = ai.classification.suggestedCategoryId && !aiSuggestedCategory
      ? `AI suggestedCategoryId 无效或不可上传：${ai.classification.suggestedCategoryId}`
      : "";
    const decision = decideIngestionTarget(ai.classification, material.userSelectedRootCategory === "AUTO" ? undefined : ingestIntent);
    const warnings = [...mediaInfo.warnings, ...frameResult.warnings, ...ai.warnings, aiSuggestedCategoryWarning].filter(Boolean);
    const nextAiResult = {
      previousAiResult: material.aiResult,
      latestSuggestion: ai.classification,
      _requestedProvider: ai.requestedProvider,
      _provider: ai.provider,
      _usedFallback: ai.usedFallback,
      _diagnostics: ai.diagnostics,
      _categorySuggestion: {
        suggestedCategoryId: ai.classification.suggestedCategoryId || "",
        valid: Boolean(aiSuggestedCategory),
        materialFieldWritten: Boolean(aiSuggestedCategory),
        warning: aiSuggestedCategoryWarning || null
      },
      _ruleDecision: decision,
      _warnings: warnings
    };

    const analyzed = await prisma.material.update({
      where: { id: material.id },
      data: {
        aiResult: nextAiResult as Prisma.InputJsonValue,
        aiSummary: ai.classification.summary,
        aiConfidence: ai.classification.confidence,
        ...(aiSuggestedCategory ? { aiSuggestedCategoryId: aiSuggestedCategory.id } : {}),
        aiSuggestedRootCategory: decision.aiSuggestedRootCategory,
        aiSuggestedSubCategory: decision.aiSuggestedSubCategory,
        classificationConflict: decision.classificationConflict,
        subjectType: ai.classification.subjectType ?? "UNKNOWN",
        visualTags: ai.classification.visualTags ?? [],
        contentIntent: ai.classification.contentIntent ?? "UNKNOWN",
        contentLongevity: ai.classification.contentLongevity ?? "UNKNOWN",
        topicName: ai.classification.topicName || null,
        topicSuggestion: ai.classification.topicSuggestion || null,
        aiEmotionTags: ai.classification.emotionTags ?? [],
        aiUsageTags: ai.classification.usageTags ?? [],
        aiSceneTags: ai.classification.sceneTags ?? [],
        aiSubjectTags: ai.classification.subjectTags ?? [],
        aiActionTags: ai.classification.actionTags ?? [],
        conflictReason: decision.conflictReason,
        needsHumanReview: true,
        status: material.status === "TRASHED" ? "TRASHED" : "NEEDS_REVIEW"
      }
    });
    const updated = await storageService.refreshSearchText(analyzed);

    await aiAnalysisJobService.createForClassifierResult({
      material: updated,
      ai,
      inputFramePaths: frameResult.frames.map((framePath) => storageService.toRelative(framePath)),
      inputMetadata: {
        source: "reanalyze",
        originalFrameCount: frameResult.frames.length,
        usedStandardizedAiFrames: false
      },
      outputResult: nextAiResult
    });
    await storageService.writeMetadataJson(updated);
    await storageService.logOperation({
      materialId: material.materialId,
      operationType: "REANALYZE",
      operatorName: "AI",
      beforeFileName: material.storedFileName,
      afterFileName: updated.storedFileName,
      beforePath: material.relativePath,
      afterPath: updated.relativePath,
      notes: `已生成新 AI 建议，未直接覆盖人工确认分类。${warnings.length ? ` warnings: ${warnings.join(" | ")}` : ""}`
    });

    return updated;
  }

  async applyLatestSuggestion(material: Material, operatorName = "本地管理员") {
    const aiResult = material.aiResult as Prisma.JsonObject | null;
    const latestSuggestion = aiResult?.latestSuggestion ?? aiResult?.appliedSuggestion ?? aiResult;
    const suggestion = AiClassificationSchema.safeParse(latestSuggestion);
    if (!suggestion.success) {
      throw new Error("没有可应用的 AI 建议，请先重新 AI 识别或编辑标签后确认。");
    }

    const decision = decideIngestionTarget(suggestion.data);
    const aiSuggestedCategory = await this.resolveAiSuggestedCategory(material.aiSuggestedCategoryId);
    const dynamicCategoryDecision = aiSuggestedCategory?.relativePath
      ? {
          targetCategory: aiSuggestedCategory.relativePath,
          assetType: aiSuggestedCategory.assetType,
          rootSub: directoryToRootAndSub(aiSuggestedCategory.relativePath)
        }
      : null;
    const desiredFileName = storageService.buildStandardFileName(
      material.materialId,
      suggestion.data,
      {
        uploaderName: material.uploaderName,
        originalFileName: material.originalFileName
      },
      path.extname(material.storedFileName)
    );
    let working = material;
    const targetCategory = dynamicCategoryDecision?.targetCategory || decision.targetCategory;
    const targetAssetType = dynamicCategoryDecision?.assetType || decision.assetType;

    if (material.primaryCategory !== targetCategory || material.assetType !== targetAssetType) {
      working = await storageService.moveMaterial({
        material,
        targetAssetType,
        targetCategory,
        targetCategoryRecord: aiSuggestedCategory,
        categoryAssignmentSource: aiSuggestedCategory ? "AI" : "USER",
        operatorName,
        notes: "应用最新 AI 建议并移动分类。"
      });
    }

    if (working.storedFileName !== desiredFileName) {
      working = await storageService.renameMaterial({
        material: working,
        desiredFileName,
        operatorName
      });
    }

    const nextAiResult = {
      ...((working.aiResult as Prisma.JsonObject | null) ?? {}),
      appliedSuggestion: suggestion.data,
      _ruleDecision: decision
    };

    const applied = await prisma.material.update({
      where: { id: working.id },
      data: {
        assetType: targetAssetType,
        primaryCategory: targetCategory,
        ...(aiSuggestedCategory
          ? {
              categoryId: aiSuggestedCategory.id,
              finalCategoryId: aiSuggestedCategory.id,
              categoryPath: aiSuggestedCategory.relativePath,
              categoryName: aiSuggestedCategory.name,
              finalRootCategory: dynamicCategoryDecision?.rootSub.rootLabel,
              finalSubCategory: aiSuggestedCategory.name || dynamicCategoryDecision?.rootSub.subCategory,
              aiSuggestedCategoryId: aiSuggestedCategory.id
            }
          : {
              finalRootCategory: decision.finalRootCategory,
              finalSubCategory: decision.finalSubCategory
            }),
        aiSuggestedRootCategory: decision.aiSuggestedRootCategory,
        aiSuggestedSubCategory: decision.aiSuggestedSubCategory,
        classificationConflict: false,
        subjectType: suggestion.data.subjectType ?? "UNKNOWN",
        visualTags: suggestion.data.visualTags ?? [],
        contentIntent: suggestion.data.contentIntent ?? "UNKNOWN",
        contentLongevity: suggestion.data.contentLongevity ?? "UNKNOWN",
        topicName: suggestion.data.topicName || null,
        topicSuggestion: suggestion.data.topicSuggestion || null,
        subject: suggestion.data.subject || null,
        scene: suggestion.data.scene || null,
        action: suggestion.data.action || null,
        usage: suggestion.data.usage || null,
        aiResult: nextAiResult as Prisma.InputJsonValue,
        aiSummary: suggestion.data.summary,
        aiConfidence: suggestion.data.confidence,
        aiEmotionTags: suggestion.data.emotionTags ?? [],
        aiUsageTags: suggestion.data.usageTags ?? [],
        aiSceneTags: suggestion.data.sceneTags ?? [],
        aiSubjectTags: suggestion.data.subjectTags ?? [],
        aiActionTags: suggestion.data.actionTags ?? [],
        conflictReason: null,
        needsHumanReview: aiSuggestedCategory ? false : decision.needsHumanReview,
        humanConfirmed: aiSuggestedCategory ? true : decision.humanConfirmed,
        status: working.status === "TRASHED" ? "TRASHED" : aiSuggestedCategory ? "READY" : decision.status
      }
    });
    const updated = await storageService.refreshSearchText(applied);

    await storageService.writeMetadataJson(updated);
    await storageService.logOperation({
      materialId: updated.materialId,
      operationType: "EDIT_TAGS",
      operatorName,
      beforeFileName: material.storedFileName,
      afterFileName: updated.storedFileName,
      beforePath: material.relativePath,
      afterPath: updated.relativePath,
      notes: "已应用最新 AI 建议到分类、命名和素材字段。"
    });

    return updated;
  }

  async resolveConflict(params: {
    material: Material;
    action: "USE_USER_SELECTION" | "USE_AI_SUGGESTION" | "MANUAL_DIRECTORY";
    category?: Category | null;
    rootCategory?: string | null;
    subCategory?: string | null;
    operatorName?: string;
  }) {
    if (params.action === "USE_AI_SUGGESTION") {
      return this.applyLatestSuggestion(params.material, params.operatorName || "本地管理员");
    }

    const userSelectedCategory =
      params.action === "USE_USER_SELECTION"
        ? await this.resolveSelectedCategory(params.material.userSelectedCategoryId).catch(() => null)
        : null;
    const targetCategoryRecord =
      params.action === "MANUAL_DIRECTORY" ? params.category : userSelectedCategory;

    const intent = normalizeIngestIntent({
      shooterId: params.material.shooterId,
      shooterName: params.material.shooterName || params.material.uploaderName,
      selectedCategory: targetCategoryRecord,
      rootCategory:
        params.action === "MANUAL_DIRECTORY"
          ? (params.rootCategory as IngestIntent["rootCategory"])
          : (params.material.userSelectedRootCategory as IngestIntent["rootCategory"]),
      subCategory:
        params.action === "MANUAL_DIRECTORY"
          ? params.subCategory || undefined
          : params.material.userSelectedSubCategory || undefined,
      customTags: Array.isArray(params.material.customTags) ? params.material.customTags.map(String) : [],
      notes: params.material.notes
    });

    if (!intent.selectedDirectory) {
      throw new Error("请选择有效的目标目录。");
    }

    let working = params.material;
    if (working.primaryCategory !== intent.selectedDirectory || working.assetType !== intent.selectedAssetType) {
      working = await storageService.moveMaterial({
        material: working,
        targetAssetType: intent.selectedAssetType,
        targetCategory: intent.selectedDirectory,
        targetCategoryRecord,
        operatorName: params.operatorName,
        notes: params.action === "MANUAL_DIRECTORY" ? "手动选择新目录解决冲突" : "采用人工选择解决冲突"
      });
    }

    const userSelectionCategoryData: Prisma.MaterialUpdateInput =
      params.action === "USE_USER_SELECTION" && userSelectedCategory
        ? {
            category: { connect: { id: userSelectedCategory.id } },
            finalCategory: { connect: { id: userSelectedCategory.id } },
            userSelectedCategory: { connect: { id: userSelectedCategory.id } },
            categoryPath: userSelectedCategory.relativePath,
            categoryName: userSelectedCategory.name
          }
        : {};

    const resolved = await prisma.material.update({
      where: { id: working.id },
      data: {
        ...userSelectionCategoryData,
        assetType: intent.selectedAssetType,
        primaryCategory: intent.selectedDirectory,
        userSelectedRootCategory: intent.rootCategory,
        userSelectedSubCategory: intent.selectedSubLabel,
        finalRootCategory: intent.selectedRootLabel,
        finalSubCategory: intent.selectedSubLabel,
        classificationConflict: false,
        conflictReason: null,
        needsHumanReview: false,
        humanConfirmed: true,
        status: working.status === "TRASHED" ? "TRASHED" : "READY"
      }
    });
    const updated = await storageService.refreshSearchText(resolved);

    await storageService.writeMetadataJson(updated);
    await storageService.logOperation({
      materialId: updated.materialId,
      operationType: "MOVE",
      operatorName: params.operatorName,
      beforePath: params.material.relativePath,
      afterPath: updated.relativePath,
      notes: params.action === "MANUAL_DIRECTORY" ? "手动选择新目录解决分类冲突" : "采用人工选择解决分类冲突"
    });

    return updated;
  }

  async scanReadyDeviceImports() {
    await storageService.initializeStorage();
    const deviceRoot = storageService.resolve("01_待导入/设备拷贝");
    const entries = await fs.readdir(deviceRoot, { withFileTypes: true });
    const folders = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const folderAbsolutePath = path.join(deviceRoot, entry.name);
      const readyPath = path.join(folderAbsolutePath, "_READY.txt");
      const importingPath = path.join(folderAbsolutePath, DEVICE_IMPORTING_FILE);
      try {
        await fs.access(readyPath);
      } catch {
        continue;
      }
      const importingInfo = await readImportingInfo(importingPath);
      const files = await fs.readdir(folderAbsolutePath, { withFileTypes: true });
      const mediaFiles = files
        .filter((file) => file.isFile())
        .filter((file) => file.name !== "_READY.txt")
        .filter((file) => file.name !== DEVICE_IMPORTING_FILE)
        .filter((file) => MEDIA_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
        .map((file) => file.name);

      folders.push({
        folderName: entry.name,
        relativePath: path.join("01_待导入/设备拷贝", entry.name),
        fileCount: mediaFiles.length,
        files: mediaFiles,
        isImporting: Boolean(importingInfo),
        importingBatchId: importingInfo?.batchId,
        importingInfo
      });
    }

    return folders;
  }

  async importDeviceFolder(params: {
    folderName: string;
    uploaderName?: string | null;
    notes?: string | null;
  }) {
    await storageService.initializeStorage();
    const folderRelativePath = path.join("01_待导入/设备拷贝", params.folderName);
    const folderAbsolutePath = storageService.resolve(folderRelativePath);
    await fs.access(path.join(folderAbsolutePath, "_READY.txt"));
    const importingPath = path.join(folderAbsolutePath, DEVICE_IMPORTING_FILE);
    if (await fileExists(importingPath)) {
      throw new Error("该设备导入文件夹已在处理中，请勿重复创建导入批次。");
    }
    const fileNames = (await fs.readdir(folderAbsolutePath, { withFileTypes: true }))
      .filter((file) => file.isFile())
      .filter((file) => file.name !== "_READY.txt")
      .filter((file) => file.name !== DEVICE_IMPORTING_FILE)
      .filter((file) => MEDIA_EXTENSIONS.has(path.extname(file.name).toLowerCase()))
      .map((file) => file.name);
    const stats = await Promise.all(fileNames.map((fileName) => fs.stat(path.join(folderAbsolutePath, fileName))));
    const batchId = await storageService.createBatchId("DEVICE_IMPORT");
    const workspaceContext = await getDefaultWorkspaceContext();
    await fs.writeFile(
      importingPath,
      JSON.stringify({
        batchId,
        createdAt: new Date().toISOString(),
        fileCount: fileNames.length,
        folderRelativePath
      }, null, 2)
    );

    await prisma.importBatch.create({
      data: {
        workspaceId: workspaceContext.workspaceId,
        batchId,
        sourceType: "DEVICE_IMPORT",
        uploaderName: params.uploaderName,
        fileCount: fileNames.length,
        totalSize: stats.reduce((sum, stat) => sum + stat.size, 0),
        status: "PROCESSING",
        notes: params.notes
      }
    });

    const jobs = [];
    for (const [index, fileName] of fileNames.entries()) {
      const stat = stats[index];
      const incomingRelativePath = path.join(folderRelativePath, fileName);
      const job = await prisma.ingestionJob.create({
        data: {
          workspaceId: workspaceContext.workspaceId,
          batchId,
          sourceType: "DEVICE_IMPORT",
          incomingRelativePath,
          originalFileName: fileName,
          fileSize: stat.size,
          mimeType: null,
          uploaderName: params.uploaderName,
          shooterName: params.uploaderName,
          notes: params.notes,
          manualAssetType: "AUTO",
          status: "QUEUED"
        }
      });
      jobs.push({
        jobId: job.id,
        originalFileName: job.originalFileName,
        fileSize: job.fileSize,
        sourceType: job.sourceType,
        incomingRelativePath: job.incomingRelativePath,
        status: job.status,
        createdAt: job.createdAt
      });
    }

    const { ingestionQueueService } = await import("@/modules/ingestion/ingestion-queue.service");
    ingestionQueueService.kick();

    return { batchId, queuedCount: jobs.length, jobs };
  }
}

async function readImportingInfo(importingPath: string) {
  try {
    const content = await fs.readFile(importingPath, "utf8");
    const parsed = JSON.parse(content) as {
      batchId?: unknown;
      createdAt?: unknown;
      fileCount?: unknown;
      folderRelativePath?: unknown;
    };
    return {
      batchId: typeof parsed.batchId === "string" ? parsed.batchId : undefined,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : undefined,
      fileCount: typeof parsed.fileCount === "number" ? parsed.fileCount : undefined,
      folderRelativePath: typeof parsed.folderRelativePath === "string" ? parsed.folderRelativePath : undefined
    };
  } catch {
    return null;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const ingestionPipeline = new IngestionPipeline();

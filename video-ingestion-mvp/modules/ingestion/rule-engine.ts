import type { AssetType, MaterialStatus } from "@prisma/client";

import type { AiClassification } from "@/modules/ai/material-classifier.service";
import type { NormalizedIngestIntent } from "@/modules/ingestion/ingest-taxonomy";
import {
  ASSET_TYPE_LABELS,
  UNSORTED_DIR,
  categoryExists,
  isBusinessCategoryForAsset,
  resolveCategorySuggestion
} from "@/lib/storage/storage.constants";
import { directoryToRootAndSub } from "@/modules/ingestion/ingest-taxonomy";

export type RuleDecision = {
  assetType: AssetType;
  targetCategory: string;
  finalRootCategory: string;
  finalSubCategory: string;
  aiSuggestedRootCategory: string;
  aiSuggestedSubCategory: string;
  classificationConflict: boolean;
  conflictReason?: string | null;
  status: MaterialStatus;
  needsHumanReview: boolean;
  humanConfirmed: boolean;
  reason: string;
};

const MATERIAL_STATUSES = {
  READY: "READY",
  NEEDS_REVIEW: "NEEDS_REVIEW"
} as const satisfies Record<string, MaterialStatus>;

export function decideIngestionTarget(
  classification: AiClassification,
  intent?: NormalizedIngestIntent
): RuleDecision {
  const assetType = classification.assetType as AssetType;
  const confidence = classification.confidence ?? 0;
  const resolvedCategory = assetType === "UNKNOWN"
    ? UNSORTED_DIR
    : resolveCategorySuggestion(
        assetType,
        classification.primaryCategory,
        classification.aiSuggestedRootCategory,
        classification.aiSuggestedSubCategory
      );
  const aiCategory = categoryExists(resolvedCategory) ? resolvedCategory : UNSORTED_DIR;
  const aiRootSub = directoryToRootAndSub(aiCategory);
  const aiSuggestedRootCategory = classification.aiSuggestedRootCategory || aiRootSub.rootLabel || ASSET_TYPE_LABELS[assetType] || "未知";
  const aiSuggestedSubCategory = classification.aiSuggestedSubCategory || aiRootSub.subCategory || "";

  if (intent?.selectedDirectory) {
    const finalRootSub = directoryToRootAndSub(intent.selectedDirectory);
    const selectedAssetType = intent.selectedAssetType;
    const conflict =
      assetType !== "UNKNOWN" &&
      assetType !== selectedAssetType &&
      confidence >= 0.6;

    return {
      assetType: selectedAssetType,
      targetCategory: intent.selectedDirectory,
      finalRootCategory: finalRootSub.rootLabel,
      finalSubCategory: finalRootSub.subCategory,
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: conflict,
      conflictReason: conflict
        ? classification.conflictReason || `人工选择为 ${intent.selectedRootLabel}，AI 建议为 ${ASSET_TYPE_LABELS[assetType] || assetType}。`
        : classification.conflictReason || null,
      status: conflict || confidence < 0.85 ? MATERIAL_STATUSES.NEEDS_REVIEW : MATERIAL_STATUSES.READY,
      needsHumanReview: conflict || confidence < 0.85 || Boolean(classification.needsHumanReview),
      humanConfirmed: false,
      reason: conflict
        ? "人工选择和 AI 建议存在冲突，保留人工目录并进入待确认。"
        : "使用人工选择的入库目录，AI 仅补充标签。"
    };
  }

  if (assetType === "UNKNOWN") {
    return {
      assetType,
      targetCategory: UNSORTED_DIR,
      finalRootCategory: "待整理",
      finalSubCategory: "待整理",
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: false,
      conflictReason: classification.conflictReason || null,
      status: MATERIAL_STATUSES.NEEDS_REVIEW,
      needsHumanReview: true,
      humanConfirmed: false,
      reason: "AI 判断为 UNKNOWN，进入待整理。"
    };
  }

  if (!categoryExists(aiCategory)) {
    return {
      assetType,
      targetCategory: UNSORTED_DIR,
      finalRootCategory: "待整理",
      finalSubCategory: "待整理",
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: false,
      conflictReason: classification.conflictReason || null,
      status: MATERIAL_STATUSES.NEEDS_REVIEW,
      needsHumanReview: true,
      humanConfirmed: false,
      reason: `AI 输出了不存在的分类 ${classification.primaryCategory}，禁止自动创建业务目录，进入待整理。`
    };
  }

  if (!isBusinessCategoryForAsset(assetType, aiCategory)) {
    return {
      assetType,
      targetCategory: UNSORTED_DIR,
      finalRootCategory: "待整理",
      finalSubCategory: "待整理",
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: false,
      conflictReason: classification.conflictReason || null,
      status: MATERIAL_STATUSES.NEEDS_REVIEW,
      needsHumanReview: true,
      humanConfirmed: false,
      reason: `AI 分类根目录与 assetType 不匹配，进入待整理。`
    };
  }

  if (confidence >= 0.85 && !classification.needsHumanReview) {
    const finalRootSub = directoryToRootAndSub(aiCategory);
    return {
      assetType,
      targetCategory: aiCategory,
      finalRootCategory: finalRootSub.rootLabel,
      finalSubCategory: finalRootSub.subCategory,
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: false,
      conflictReason: classification.conflictReason || null,
      status: MATERIAL_STATUSES.READY,
      needsHumanReview: false,
      humanConfirmed: false,
      reason: "置信度 >= 0.85 且分类合法，自动入库。"
    };
  }

  if (confidence >= 0.6) {
    const finalRootSub = directoryToRootAndSub(aiCategory);
    return {
      assetType,
      targetCategory: aiCategory,
      finalRootCategory: finalRootSub.rootLabel,
      finalSubCategory: finalRootSub.subCategory,
      aiSuggestedRootCategory,
      aiSuggestedSubCategory,
      classificationConflict: false,
      conflictReason: classification.conflictReason || null,
      status: MATERIAL_STATUSES.NEEDS_REVIEW,
      needsHumanReview: true,
      humanConfirmed: false,
      reason: "置信度在 0.60 到 0.85 之间，进入待确认。"
    };
  }

  return {
    assetType,
    targetCategory: UNSORTED_DIR,
    finalRootCategory: "待整理",
    finalSubCategory: "待整理",
    aiSuggestedRootCategory,
    aiSuggestedSubCategory,
    classificationConflict: false,
    conflictReason: classification.conflictReason || null,
    status: MATERIAL_STATUSES.NEEDS_REVIEW,
    needsHumanReview: true,
    humanConfirmed: false,
    reason: "置信度 < 0.60，进入待整理。"
  };
}

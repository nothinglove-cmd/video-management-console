import type { AssetType, Category } from "@prisma/client";

import {
  ASSET_TYPE_LABELS,
  SUB_CATEGORY_OPTIONS,
  getAssetTypeForRootCategory,
  getDirectoryForUserSelection,
  getRootCategoryForDirectory,
  getSubCategoryLabelForDirectory,
  type UploadRootCategory
} from "@/lib/storage/storage.constants";

export type IngestIntent = {
  shooterId?: string | null;
  shooterName?: string | null;
  rootCategory: UploadRootCategory;
  subCategory: string;
  customTags: string[];
  notes?: string | null;
};

export type NormalizedIngestIntent = IngestIntent & {
  selectedAssetType: AssetType;
  selectedDirectory: string | null;
  selectedRootLabel: string;
  selectedSubLabel: string;
  selectedCategoryId?: string | null;
  selectedCategoryName?: string | null;
};

export const DEFAULT_INGEST_INTENT: IngestIntent = {
  rootCategory: "AUTO",
  subCategory: "AUTO",
  customTags: []
};

export function normalizeCustomTags(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
  }
  if (typeof value !== "string") return [];
  return value
    .split(/[，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function normalizeIngestIntent(input: Partial<IngestIntent> & {
  selectedCategory?: Pick<Category, "id" | "name" | "assetType" | "relativePath"> | null;
}): NormalizedIngestIntent {
  if (input.selectedCategory?.relativePath) {
    const rootSub = directoryToRootAndSub(input.selectedCategory.relativePath);
    const rootCategory = rootSub.rootCategory;
    return {
      rootCategory,
      subCategory: input.selectedCategory.relativePath,
      customTags: normalizeCustomTags(input.customTags),
      shooterId: input.shooterId || null,
      shooterName: input.shooterName?.trim() || null,
      notes: input.notes || null,
      selectedAssetType: input.selectedCategory.assetType,
      selectedDirectory: input.selectedCategory.relativePath,
      selectedRootLabel: rootSub.rootLabel,
      selectedSubLabel: input.selectedCategory.name,
      selectedCategoryId: input.selectedCategory.id,
      selectedCategoryName: input.selectedCategory.name
    };
  }

  const rootCategory = isUploadRootCategory(input.rootCategory) ? input.rootCategory : "AUTO";
  const options = SUB_CATEGORY_OPTIONS[rootCategory];
  const subCategory = options.some((item) => item.value === input.subCategory)
    ? String(input.subCategory)
    : options[0]?.value || "AUTO";
  const selectedAssetType = getAssetTypeForRootCategory(rootCategory);
  const selectedDirectory = getDirectoryForUserSelection(rootCategory, subCategory);
  const selectedRootLabel =
    rootCategory === "AUTO" ? "自动判断" : ASSET_TYPE_LABELS[selectedAssetType] || "未知";
  const selectedSubLabel =
    rootCategory === "AUTO"
      ? "让 AI 判断"
      : options.find((item) => item.value === subCategory)?.label || "";

  return {
    rootCategory,
    subCategory,
    customTags: normalizeCustomTags(input.customTags),
    shooterId: input.shooterId || null,
    shooterName: input.shooterName?.trim() || null,
    notes: input.notes || null,
    selectedAssetType,
    selectedDirectory,
    selectedRootLabel,
    selectedSubLabel
  };
}

export function directoryToRootAndSub(directory?: string | null) {
  const root = getRootCategoryForDirectory(directory);
  return {
    rootCategory: root,
    rootLabel: root === "AUTO" ? "待整理" : ASSET_TYPE_LABELS[getAssetTypeForRootCategory(root)],
    subCategory: getSubCategoryLabelForDirectory(directory),
    directory: directory || ""
  };
}

function isUploadRootCategory(value: unknown): value is UploadRootCategory {
  return typeof value === "string" && value in SUB_CATEGORY_OPTIONS;
}

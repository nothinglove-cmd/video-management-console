import type { AssetType } from "@prisma/client";

export const STORAGE_DIRECTORIES = [
  "01_待导入",
  "01_待导入/手机上传",
  "01_待导入/电脑上传",
  "01_待导入/设备拷贝",
  "01_待导入/处理中",
  "01_待导入/待整理",
  "01_待导入/失败",
  "01_待导入/导入报告",
  "02_账号素材",
  "02_账号素材/01_人物镜头",
  "02_账号素材/02_动物镜头",
  "02_账号素材/03_场景环境",
  "02_账号素材/04_事件过程",
  "02_账号素材/05_物品道具",
  "02_账号素材/06_情绪钩子",
  "02_账号素材/07_空镜转场",
  "02_账号素材/08_热点素材",
  "02_账号素材/99_待整理",
  "03_产品素材",
  "03_产品素材/01_痛点镜头",
  "03_产品素材/02_产品空镜",
  "03_产品素材/03_使用过程",
  "03_产品素材/04_对比证明",
  "03_产品素材/05_资质反馈",
  "03_产品素材/06_直播促单",
  "03_产品素材/07_口播素材",
  "03_产品素材/99_待整理",
  "04_对标视频",
  "04_对标视频/01_账号对标",
  "04_对标视频/02_产品对标",
  "04_对标视频/03_爆款结构",
  "04_对标视频/04_封面标题",
  "04_对标视频/05_直播带货",
  "04_对标视频/99_待整理",
  "05_精选剪辑包",
  "05_精选剪辑包/账号内容包",
  "05_精选剪辑包/产品内容包",
  "06_成片发布",
  "06_成片发布/成片导出",
  "06_成片发布/发布包",
  "07_公共资源",
  "07_公共资源/音乐音效",
  "07_公共资源/字幕模板",
  "07_公共资源/Logo贴纸",
  "07_公共资源/片尾素材",
  "07_公共资源/其他资源",
  "08_备份",
  "99_回收站",
  "99_回收站/目录回收站"
] as const;

export const PENDING_DIRS = {
  WEB_MOBILE_UPLOAD: "01_待导入/手机上传",
  WEB_DESKTOP_UPLOAD: "01_待导入/电脑上传",
  DEVICE_IMPORT: "01_待导入/设备拷贝",
  MANUAL_IMPORT: "01_待导入/电脑上传"
} as const;

export const PROCESSING_DIR = "01_待导入/处理中";
export const UNSORTED_DIR = "01_待导入/待整理";
export const FAILED_DIR = "01_待导入/失败";
export const TRASH_DIR = "99_回收站";
export const DIRECTORY_TRASH_DIR = "99_回收站/目录回收站";

export const BUSINESS_CATEGORIES = {
  ACCOUNT_MATERIAL: [
    "02_账号素材/01_人物镜头",
    "02_账号素材/02_动物镜头",
    "02_账号素材/03_场景环境",
    "02_账号素材/04_事件过程",
    "02_账号素材/05_物品道具",
    "02_账号素材/06_情绪钩子",
    "02_账号素材/07_空镜转场",
    "02_账号素材/08_热点素材",
    "02_账号素材/99_待整理"
  ],
  PRODUCT_MATERIAL: [
    "03_产品素材/01_痛点镜头",
    "03_产品素材/02_产品空镜",
    "03_产品素材/03_使用过程",
    "03_产品素材/04_对比证明",
    "03_产品素材/05_资质反馈",
    "03_产品素材/06_直播促单",
    "03_产品素材/07_口播素材",
    "03_产品素材/99_待整理"
  ],
  REFERENCE_VIDEO: [
    "04_对标视频/01_账号对标",
    "04_对标视频/02_产品对标",
    "04_对标视频/03_爆款结构",
    "04_对标视频/04_封面标题",
    "04_对标视频/05_直播带货",
    "04_对标视频/99_待整理"
  ],
  PUBLIC_RESOURCE: [
    "07_公共资源/音乐音效",
    "07_公共资源/字幕模板",
    "07_公共资源/Logo贴纸",
    "07_公共资源/片尾素材",
    "07_公共资源/其他资源"
  ],
  UNKNOWN: [UNSORTED_DIR]
} as const satisfies Record<AssetType, readonly string[]>;

export const LEGACY_CATEGORY_ALIASES: Record<string, string> = {
  "02_账号素材/01_猫狗镜头": "02_账号素材/02_动物镜头",
  "02_账号素材/02_阿阳出镜": "02_账号素材/01_人物镜头",
  "02_账号素材/03_小院环境": "02_账号素材/03_场景环境",
  "02_账号素材/04_救助过程": "02_账号素材/04_事件过程",
  "02_账号素材/05_物资捐赠": "02_账号素材/05_物品道具",
  "02_账号素材/06_开头情绪": "02_账号素材/06_情绪钩子"
};

export const SUBJECT_TYPE_OPTIONS = [
  { value: "PERSON", label: "人物" },
  { value: "ANIMAL", label: "动物" },
  { value: "LANDSCAPE", label: "风景/环境" },
  { value: "PRODUCT", label: "产品" },
  { value: "OBJECT", label: "物品/道具" },
  { value: "EVENT", label: "事件/过程" },
  { value: "UNKNOWN", label: "未知" }
] as const;

export const CONTENT_INTENT_OPTIONS = [
  { value: "DAILY_CONTENT", label: "日常素材" },
  { value: "HOOK", label: "热点吸引/开头钩子" },
  { value: "TOPIC", label: "长期专题" },
  { value: "PRODUCT_SUPPORT", label: "产品辅助" },
  { value: "REFERENCE", label: "对标参考" },
  { value: "TEST", label: "测试素材" },
  { value: "UNKNOWN", label: "未知" }
] as const;

export const CONTENT_LONGEVITY_OPTIONS = [
  { value: "ONE_OFF", label: "一次性/偶发" },
  { value: "SEASONAL", label: "阶段性" },
  { value: "LONG_TERM", label: "长期可做" },
  { value: "UNKNOWN", label: "未知" }
] as const;

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  ACCOUNT_MATERIAL: "账号素材",
  PRODUCT_MATERIAL: "产品素材",
  REFERENCE_VIDEO: "对标视频",
  PUBLIC_RESOURCE: "公共资源",
  UNKNOWN: "未知"
};

export const ROOT_CATEGORY_OPTIONS = [
  { value: "AUTO", label: "自动判断", assetType: "UNKNOWN", rootDirectory: "" },
  { value: "ACCOUNT_MATERIAL", label: "账号素材", assetType: "ACCOUNT_MATERIAL", rootDirectory: "02_账号素材" },
  { value: "PRODUCT_MATERIAL", label: "产品素材", assetType: "PRODUCT_MATERIAL", rootDirectory: "03_产品素材" },
  { value: "REFERENCE_VIDEO", label: "对标视频", assetType: "REFERENCE_VIDEO", rootDirectory: "04_对标视频" },
  { value: "PUBLIC_RESOURCE", label: "公共资源", assetType: "PUBLIC_RESOURCE", rootDirectory: "07_公共资源" }
] as const;

export type UploadRootCategory = (typeof ROOT_CATEGORY_OPTIONS)[number]["value"];

export const SUB_CATEGORY_OPTIONS: Record<UploadRootCategory, readonly { value: string; label: string; directory: string }[]> = {
  AUTO: [{ value: "AUTO", label: "让 AI 判断", directory: UNSORTED_DIR }],
  ACCOUNT_MATERIAL: [
    { value: "01_人物镜头", label: "人物镜头", directory: "02_账号素材/01_人物镜头" },
    { value: "02_动物镜头", label: "动物镜头", directory: "02_账号素材/02_动物镜头" },
    { value: "03_场景环境", label: "场景环境", directory: "02_账号素材/03_场景环境" },
    { value: "04_事件过程", label: "事件过程", directory: "02_账号素材/04_事件过程" },
    { value: "05_物品道具", label: "物品道具", directory: "02_账号素材/05_物品道具" },
    { value: "06_情绪钩子", label: "情绪钩子", directory: "02_账号素材/06_情绪钩子" },
    { value: "07_空镜转场", label: "空镜转场", directory: "02_账号素材/07_空镜转场" },
    { value: "08_热点素材", label: "热点素材", directory: "02_账号素材/08_热点素材" },
    { value: "99_待整理", label: "待整理", directory: "02_账号素材/99_待整理" }
  ],
  PRODUCT_MATERIAL: [
    { value: "01_痛点镜头", label: "痛点镜头", directory: "03_产品素材/01_痛点镜头" },
    { value: "02_产品空镜", label: "产品空镜", directory: "03_产品素材/02_产品空镜" },
    { value: "03_使用过程", label: "使用过程", directory: "03_产品素材/03_使用过程" },
    { value: "04_对比证明", label: "对比证明", directory: "03_产品素材/04_对比证明" },
    { value: "05_资质反馈", label: "资质反馈", directory: "03_产品素材/05_资质反馈" },
    { value: "06_直播促单", label: "直播促单", directory: "03_产品素材/06_直播促单" },
    { value: "07_口播素材", label: "口播素材", directory: "03_产品素材/07_口播素材" },
    { value: "99_待整理", label: "待整理", directory: "03_产品素材/99_待整理" }
  ],
  REFERENCE_VIDEO: [
    { value: "01_账号对标", label: "账号对标", directory: "04_对标视频/01_账号对标" },
    { value: "02_产品对标", label: "产品对标", directory: "04_对标视频/02_产品对标" },
    { value: "03_爆款结构", label: "爆款结构", directory: "04_对标视频/03_爆款结构" },
    { value: "04_封面标题", label: "封面标题", directory: "04_对标视频/04_封面标题" },
    { value: "05_直播带货", label: "直播带货", directory: "04_对标视频/05_直播带货" },
    { value: "99_待整理", label: "待整理", directory: "04_对标视频/99_待整理" }
  ],
  PUBLIC_RESOURCE: [
    { value: "音乐音效", label: "音乐音效", directory: "07_公共资源/音乐音效" },
    { value: "字幕模板", label: "字幕模板", directory: "07_公共资源/字幕模板" },
    { value: "Logo贴纸", label: "Logo贴纸", directory: "07_公共资源/Logo贴纸" },
    { value: "片尾素材", label: "片尾素材", directory: "07_公共资源/片尾素材" },
    { value: "其他资源", label: "其他资源", directory: "07_公共资源/其他资源" }
  ]
};

export function getAllowedCategories(assetType: AssetType) {
  return BUSINESS_CATEGORIES[assetType] ?? [UNSORTED_DIR];
}

export function isBusinessCategoryForAsset(assetType: AssetType, category: string) {
  return (getAllowedCategories(assetType) as readonly string[]).includes(normalizeCategoryAlias(category));
}

export function getFallbackCategory(assetType: AssetType) {
  if (assetType === "ACCOUNT_MATERIAL") return "02_账号素材/99_待整理";
  if (assetType === "PRODUCT_MATERIAL") return "03_产品素材/99_待整理";
  if (assetType === "REFERENCE_VIDEO") return "04_对标视频/99_待整理";
  if (assetType === "PUBLIC_RESOURCE") return "07_公共资源/其他资源";
  return UNSORTED_DIR;
}

export function getAssetTypeForRootCategory(rootCategory?: string | null): AssetType {
  if (rootCategory === "ACCOUNT_MATERIAL") return "ACCOUNT_MATERIAL";
  if (rootCategory === "PRODUCT_MATERIAL") return "PRODUCT_MATERIAL";
  if (rootCategory === "REFERENCE_VIDEO") return "REFERENCE_VIDEO";
  if (rootCategory === "PUBLIC_RESOURCE") return "PUBLIC_RESOURCE";
  return "UNKNOWN";
}

export function getDirectoryForUserSelection(rootCategory?: string | null, subCategory?: string | null) {
  if (!rootCategory || rootCategory === "AUTO") return null;
  const options = SUB_CATEGORY_OPTIONS[rootCategory as UploadRootCategory] || [];
  const matched = options.find((item) => matchesSubCategoryOption(item, subCategory));
  return matched?.directory || getFallbackCategory(getAssetTypeForRootCategory(rootCategory));
}

export function getRootCategoryForDirectory(directory?: string | null): UploadRootCategory {
  if (!directory) return "AUTO";
  if (directory.startsWith("02_账号素材")) return "ACCOUNT_MATERIAL";
  if (directory.startsWith("03_产品素材")) return "PRODUCT_MATERIAL";
  if (directory.startsWith("04_对标视频")) return "REFERENCE_VIDEO";
  if (directory.startsWith("07_公共资源")) return "PUBLIC_RESOURCE";
  return "AUTO";
}

export function getSubCategoryLabelForDirectory(directory?: string | null) {
  if (!directory) return "";
  const normalized = normalizeCategoryAlias(directory);
  const root = getRootCategoryForDirectory(normalized);
  const options = SUB_CATEGORY_OPTIONS[root] || [];
  return options.find((item) => item.directory === normalized)?.label || normalized.split("/").at(-1) || "";
}

export function normalizeCategoryAlias(category?: string | null) {
  if (!category) return "";
  return LEGACY_CATEGORY_ALIASES[category] || category;
}

export function categoryExists(category?: string | null) {
  if (!category) return false;
  return (STORAGE_DIRECTORIES as readonly string[]).includes(normalizeCategoryAlias(category));
}

export function resolveCategorySuggestion(
  assetType: AssetType,
  primaryCategory?: string | null,
  suggestedRoot?: string | null,
  suggestedSub?: string | null
) {
  const normalizedPrimary = normalizeCategoryAlias(primaryCategory);
  if (normalizedPrimary && isBusinessCategoryForAsset(assetType, normalizedPrimary)) return normalizedPrimary;

  const rootCategory = getUploadRootFromSuggestion(assetType, primaryCategory || suggestedRoot);
  if (rootCategory !== "AUTO") {
    const options = SUB_CATEGORY_OPTIONS[rootCategory] || [];
    const matched = options.find((item) => matchesSubCategoryOption(item, suggestedSub));
    if (matched) return matched.directory;
  }

  if (normalizedPrimary && categoryExists(normalizedPrimary)) return normalizedPrimary;
  return getFallbackCategory(assetType);
}

export function getAllSelectableCategories() {
  return [
    ...BUSINESS_CATEGORIES.ACCOUNT_MATERIAL,
    ...BUSINESS_CATEGORIES.PRODUCT_MATERIAL,
    ...BUSINESS_CATEGORIES.REFERENCE_VIDEO,
    ...BUSINESS_CATEGORIES.PUBLIC_RESOURCE,
    UNSORTED_DIR
  ];
}

function getUploadRootFromSuggestion(assetType: AssetType, root?: string | null): UploadRootCategory {
  if (root === "ACCOUNT_MATERIAL" || root === "账号素材" || root === "02_账号素材") return "ACCOUNT_MATERIAL";
  if (root === "PRODUCT_MATERIAL" || root === "产品素材" || root === "03_产品素材") return "PRODUCT_MATERIAL";
  if (root === "REFERENCE_VIDEO" || root === "对标视频" || root === "04_对标视频") return "REFERENCE_VIDEO";
  if (root === "PUBLIC_RESOURCE" || root === "公共资源" || root === "07_公共资源") return "PUBLIC_RESOURCE";
  if (assetType === "ACCOUNT_MATERIAL") return "ACCOUNT_MATERIAL";
  if (assetType === "PRODUCT_MATERIAL") return "PRODUCT_MATERIAL";
  if (assetType === "REFERENCE_VIDEO") return "REFERENCE_VIDEO";
  if (assetType === "PUBLIC_RESOURCE") return "PUBLIC_RESOURCE";
  return "AUTO";
}

function matchesSubCategoryOption(
  item: { value: string; label: string; directory: string },
  value?: string | null
) {
  if (!value) return false;
  const normalized = normalizeCategoryAlias(value);
  const tail = normalized.split("/").at(-1) || normalized;
  return (
    item.value === normalized ||
    item.label === normalized ||
    item.directory === normalized ||
    item.value === tail ||
    item.label === tail ||
    item.directory.endsWith(`/${tail}`) ||
    item.value.replace(/^\d+_/, "") === normalized ||
    item.label.replace(/^\d+_/, "") === normalized
  );
}

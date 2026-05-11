export type UploadCategoryOptionSource = {
  id: string;
  name: string;
  parentId?: string | null;
  relativePath?: string | null;
  status: string;
  allowUpload: boolean;
  sortOrder: number;
  childCount?: number;
};

export type UploadCategoryOption = {
  id: string;
  label: string;
  storagePath: string;
  rootKey: string;
  sortOrder: number;
  name: string;
};

const ROOT_ORDER = ["02_账号素材", "03_产品素材", "04_对标视频", "07_公共资源"] as const;

const ROOT_LABELS: Record<string, string> = {
  "02_账号素材": "账号素材",
  "03_产品素材": "产品素材",
  "04_对标视频": "对标视频",
  "07_公共资源": "公共资源"
};

export function buildUploadCategoryOptions(categories: UploadCategoryOptionSource[]): UploadCategoryOption[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const childCountByParent = new Map<string, number>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childCountByParent.set(category.parentId, (childCountByParent.get(category.parentId) || 0) + 1);
  }

  return categories
    .filter((category) => {
      const actualChildCount = childCountByParent.get(category.id) || 0;
      return (
        category.status === "ACTIVE" &&
        category.allowUpload &&
        Boolean(category.relativePath) &&
        (category.childCount ?? actualChildCount) === 0 &&
        actualChildCount === 0
      );
    })
    .map((category) => {
      const storagePath = category.relativePath || "";
      const rootKey = storagePath.split("/")[0] || "";
      return {
        id: category.id,
        label: buildOptionLabel(category, byId, rootKey),
        storagePath,
        rootKey,
        sortOrder: category.sortOrder,
        name: category.name
      };
    })
    .sort((a, b) => (
      rootRank(a.rootKey) - rootRank(b.rootKey) ||
      a.sortOrder - b.sortOrder ||
      a.storagePath.localeCompare(b.storagePath, "zh-Hans-CN") ||
      a.name.localeCompare(b.name, "zh-Hans-CN") ||
      a.label.localeCompare(b.label, "zh-Hans-CN")
    ));
}

function rootRank(rootKey: string) {
  const index = ROOT_ORDER.indexOf(rootKey as (typeof ROOT_ORDER)[number]);
  return index === -1 ? ROOT_ORDER.length : index;
}

function buildOptionLabel(
  category: UploadCategoryOptionSource,
  byId: Map<string, UploadCategoryOptionSource>,
  rootKey: string
) {
  const names = buildCategoryNamePath(category, byId).map(stripOrderPrefix).filter(Boolean);
  if (ROOT_LABELS[rootKey]) {
    const childNames = names.slice(names[0] === ROOT_LABELS[rootKey] ? 1 : 0);
    return [ROOT_LABELS[rootKey], ...childNames].join(" / ");
  }
  return names.join(" / ") || stripOrderPrefix(category.name);
}

function buildCategoryNamePath(
  category: UploadCategoryOptionSource,
  byId: Map<string, UploadCategoryOptionSource>
) {
  const names: string[] = [];
  let current: UploadCategoryOptionSource | undefined = category;
  while (current) {
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names;
}

function stripOrderPrefix(value: string) {
  return value.trim().replace(/^\d+[_-]/, "");
}

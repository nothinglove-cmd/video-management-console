import fs from "node:fs/promises";
import path from "node:path";
import type { AssetType, Category } from "@prisma/client";

import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { prisma } from "@/lib/prisma";
import { DIRECTORY_TRASH_DIR } from "@/lib/storage/storage.constants";
import { storageService } from "@/lib/storage/storage.service";
import { isProtectedRoot } from "@/lib/categories/category.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

const MAX_DIRECTORY_DEPTH = 3;
const CATEGORY_METADATA_FILE = ".category.json";

type DirectoryOperationInput = {
  categoryId?: string;
  operatorName?: string;
  notes?: string;
};

export async function createRealDirectory(input: DirectoryOperationInput & {
  parentId: string;
  name: string;
  folderName?: string;
  allowUpload?: boolean;
  sortOrder?: number;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("栏目名称不能为空。");
  const parent = await requireCategory(input.parentId);
  if (!parent.relativePath) throw new Error("父级目录没有绑定真实路径。");
  if (parent.depth >= MAX_DIRECTORY_DEPTH) throw new Error(`真实目录最多支持 ${MAX_DIRECTORY_DEPTH} 层。`);
  const folderName = sanitizeSegment(input.folderName || name);
  const relativePath = path.posix.join(parent.relativePath, folderName);
  const nextDepth = parent.depth + 1;
  await assertDestinationAvailable(relativePath);
  const absolutePath = storageService.resolve(relativePath);
  await fs.mkdir(absolutePath, { recursive: false });
  const workspaceContext = await getDefaultWorkspaceContext();

  let category: Category | null = null;
  try {
    category = await prisma.category.create({
      data: {
        workspaceId: parent.workspaceId ?? workspaceContext.workspaceId,
        storageProviderId: parent.storageProviderId ?? workspaceContext.storageProviderId,
        code: relativePath,
        name,
        assetType: parent.assetType,
        parentId: parent.id,
        directoryName: folderName,
        storagePath: relativePath,
        level: nextDepth,
        relativePath,
        physicalDirectory: relativePath,
        sortOrder: input.sortOrder ?? 100,
        depth: nextDepth,
        allowUpload: input.allowUpload ?? true,
        notes: input.notes
      }
    });

    await writeCategoryMetadataJson(category);

    await logDirectoryOperation({
      categoryId: category.id,
      operationType: "CREATE",
      operatorName: input.operatorName,
      afterPath: relativePath,
      notes: input.notes
    }).catch(() => undefined);
    return category;
  } catch (error) {
    if (category) {
      await prisma.category.delete({ where: { id: category.id } }).catch(() => undefined);
    }
    await removeDirectoryTree(absolutePath);
    throw new Error(`栏目真实目录创建失败，已回滚：${(error as Error).message}`);
  }
}

export async function renameRealDirectory(input: DirectoryOperationInput & {
  categoryId: string;
  name: string;
  folderName?: string;
  allowUpload?: boolean;
  sortOrder?: number;
  status?: "ACTIVE" | "DISABLED";
}) {
  const category = await requireCategory(input.categoryId);
  const beforePath = category.relativePath;
  if (!beforePath) throw new Error("栏目没有绑定真实目录。");
  let afterPath: string = beforePath;

  if (!isProtectedRoot(category) && input.folderName) {
    const folderName = sanitizeSegment(input.folderName);
    afterPath = path.posix.join(path.posix.dirname(beforePath), folderName);
    if (afterPath !== beforePath) {
      await assertDestinationAvailable(afterPath);
      await storageService.safeMove(storageService.resolve(beforePath), storageService.resolve(afterPath));
    }
  }

  const affectedMaterialCount = afterPath !== beforePath
    ? await syncPathPrefix({
        category,
        beforePath,
        afterPath,
        statusForMaterials: undefined
      })
    : await prisma.material.count({ where: { relativePath: { startsWith: `${beforePath}/` } } });

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: {
      name: input.name.trim(),
      code: afterPath,
      directoryName: path.posix.basename(afterPath),
      storagePath: afterPath,
      level: afterPath.split("/").length,
      relativePath: afterPath,
      physicalDirectory: afterPath,
      sortOrder: input.sortOrder,
      allowUpload: isProtectedRoot(category) ? false : input.allowUpload,
      status: input.status
    }
  });
  await writeCategoryMetadataJson(updated);

  await logDirectoryOperation({
    categoryId: category.id,
    operationType: "RENAME",
    operatorName: input.operatorName,
    beforePath,
    afterPath,
    affectedMaterialCount,
    notes: input.notes
  });
  return updated;
}

export async function moveRealDirectory(input: DirectoryOperationInput & {
  categoryId: string;
  targetParentId: string;
}) {
  const category = await requireCategory(input.categoryId);
  const targetParent = await requireCategory(input.targetParentId);
  if (isProtectedRoot(category)) throw new Error("系统根目录不能移动。");
  if (!category.relativePath || !targetParent.relativePath) throw new Error("目录没有绑定真实路径。");
  if (category.id === targetParent.id) throw new Error("不能移动到自身。");
  if (targetParent.relativePath.startsWith(`${category.relativePath}/`)) throw new Error("不能移动到自己的子目录。");
  const subtreeHeight = await getSubtreeHeight(category.id);
  if (targetParent.depth + subtreeHeight > MAX_DIRECTORY_DEPTH) throw new Error(`移动后会超过 ${MAX_DIRECTORY_DEPTH} 层。`);

  const beforePath = category.relativePath;
  const afterPath = path.posix.join(targetParent.relativePath, path.posix.basename(beforePath));
  await assertDestinationAvailable(afterPath);
  await storageService.safeMove(storageService.resolve(beforePath), storageService.resolve(afterPath));

  const affectedMaterialCount = await syncPathPrefix({
    category,
    beforePath,
    afterPath,
    targetParent,
    statusForMaterials: undefined
  });

  const updated = await prisma.category.update({
    where: { id: category.id },
    data: {
      parentId: targetParent.id,
      assetType: targetParent.assetType,
      depth: targetParent.depth + 1,
      code: afterPath,
      directoryName: path.posix.basename(afterPath),
      storagePath: afterPath,
      level: afterPath.split("/").length,
      relativePath: afterPath,
      physicalDirectory: afterPath
    }
  });
  await writeCategoryMetadataJson(updated);

  await logDirectoryOperation({
    categoryId: category.id,
    operationType: "MOVE",
    operatorName: input.operatorName,
    beforePath,
    afterPath,
    affectedMaterialCount,
    notes: input.notes
  });
  return updated;
}

export async function trashRealDirectory(input: DirectoryOperationInput & { categoryId: string }) {
  const category = await requireCategory(input.categoryId);
  if (isProtectedRoot(category)) throw new Error("系统根目录不能删除。");
  if (!category.relativePath) throw new Error("目录没有绑定真实路径。");
  const beforePath = category.relativePath;
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const afterPath = path.posix.join(DIRECTORY_TRASH_DIR, `${stamp}_${path.posix.basename(beforePath)}`);
  await fs.mkdir(storageService.resolve(DIRECTORY_TRASH_DIR), { recursive: true });
  await assertDestinationAvailable(afterPath);
  await storageService.safeMove(storageService.resolve(beforePath), storageService.resolve(afterPath));

  const affectedMaterialCount = await syncPathPrefix({
    category,
    beforePath,
    afterPath,
    statusForMaterials: "TRASHED"
  });
  await prisma.category.updateMany({
    where: { OR: [{ id: category.id }, { relativePath: { startsWith: `${afterPath}/` } }] },
    data: { status: "DELETED", allowUpload: false }
  });
  await logDirectoryOperation({
    categoryId: category.id,
    operationType: "TRASH",
    operatorName: input.operatorName,
    beforePath,
    afterPath,
    affectedMaterialCount,
    notes: input.notes
  });
  return { categoryId: category.id, beforePath, afterPath, affectedMaterialCount };
}

export async function restoreRealDirectory(input: DirectoryOperationInput & {
  categoryId: string;
  targetParentId?: string;
}) {
  const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
  if (!category?.relativePath) throw new Error("目录不存在或没有可恢复路径。");
  const lastTrash = await prisma.directoryOperationLog.findFirst({
    where: { categoryId: category.id, operationType: "TRASH" },
    orderBy: { createdAt: "desc" }
  });
  const targetParent = input.targetParentId ? await requireCategory(input.targetParentId) : null;
  const beforePath = category.relativePath;
  const originalPath = lastTrash?.beforePath || path.posix.basename(beforePath);
  const afterPath = targetParent?.relativePath
    ? path.posix.join(targetParent.relativePath, path.posix.basename(originalPath))
    : originalPath;
  if (targetParent && targetParent.depth + await getSubtreeHeight(category.id) > MAX_DIRECTORY_DEPTH) {
    throw new Error(`恢复后会超过 ${MAX_DIRECTORY_DEPTH} 层。`);
  }
  await assertDestinationAvailable(afterPath);
  await storageService.safeMove(storageService.resolve(beforePath), storageService.resolve(afterPath));
  const affectedMaterialCount = await syncPathPrefix({
    category,
    beforePath,
    afterPath,
    targetParent: targetParent ?? undefined,
    statusForMaterials: "READY"
  });
  await prisma.category.updateMany({
    where: { OR: [{ id: category.id }, { relativePath: { startsWith: `${afterPath}/` } }] },
    data: { status: "ACTIVE" }
  });
  await logDirectoryOperation({
    categoryId: category.id,
    operationType: "RESTORE",
    operatorName: input.operatorName,
    beforePath,
    afterPath,
    affectedMaterialCount,
    notes: input.notes
  });
  return { categoryId: category.id, beforePath, afterPath, affectedMaterialCount };
}

async function syncPathPrefix({
  category,
  beforePath,
  afterPath,
  targetParent,
  statusForMaterials
}: {
  category: Category;
  beforePath: string;
  afterPath: string;
  targetParent?: Category;
  statusForMaterials?: "TRASHED" | "READY";
}) {
  const categories = await prisma.category.findMany({
    where: { OR: [{ id: category.id }, { relativePath: { startsWith: `${beforePath}/` } }] }
  });
  const updatedCategoriesByBeforePath = new Map<string, Category>();
  const updatedCategoriesById = new Map<string, Category>();
  for (const item of categories) {
    const nextPath = replacePrefix(item.relativePath, beforePath, afterPath);
    if (!nextPath) continue;
    const relativeDepth = nextPath.split("/").length;
    const updatedCategory = await prisma.category.update({
      where: { id: item.id },
      data: {
        code: nextPath,
        directoryName: path.posix.basename(nextPath),
        storagePath: nextPath,
        level: relativeDepth,
        relativePath: nextPath,
        physicalDirectory: nextPath,
        assetType: targetParent?.assetType ?? item.assetType,
        depth: relativeDepth
      }
    });
    updatedCategoriesByBeforePath.set(item.relativePath || "", updatedCategory);
    updatedCategoriesById.set(updatedCategory.id, updatedCategory);
    await writeCategoryMetadataJson(updatedCategory);
  }

  const materials = await prisma.material.findMany({
    where: { relativePath: { startsWith: `${beforePath}/` } }
  });
  for (const material of materials) {
    const nextRelativePath = replacePrefix(material.relativePath, beforePath, afterPath) || material.relativePath;
    const nextThumbnailPath = replacePrefix(material.thumbnailPath, beforePath, afterPath);
    const nextPrimaryCategory = replacePrefix(material.primaryCategory, beforePath, afterPath) || material.primaryCategory;
    const matchedCategory =
      getUpdatedCategoryForMaterial(material, updatedCategoriesById, updatedCategoriesByBeforePath) ||
      getUpdatedCategoryByPath(nextPrimaryCategory, updatedCategoriesByBeforePath) ||
      getUpdatedCategoryByPath(path.posix.dirname(nextRelativePath), updatedCategoriesByBeforePath);
    const updated = await prisma.material.update({
      where: { id: material.id },
      data: {
        relativePath: nextRelativePath,
        absolutePath: storageService.resolve(nextRelativePath),
        thumbnailPath: nextThumbnailPath ?? material.thumbnailPath,
        primaryCategory: statusForMaterials === "TRASHED" ? material.primaryCategory : nextPrimaryCategory,
        categoryId: matchedCategory?.id ?? material.categoryId,
        finalCategoryId: matchedCategory?.id ?? material.finalCategoryId,
        categoryPath: matchedCategory?.relativePath ?? material.categoryPath,
        categoryName: matchedCategory?.name ?? material.categoryName,
        status: statusForMaterials ?? material.status,
        assetType: targetParent?.assetType ?? material.assetType
      }
    });
    const refreshed = await storageService.refreshSearchText(updated);
    await storageService.writeMetadataJson(refreshed);
  }
  return materials.length;
}

function getUpdatedCategoryForMaterial(
  material: { categoryId?: string | null; finalCategoryId?: string | null; primaryCategory: string; relativePath: string },
  categoriesById: Map<string, Category>,
  categoriesByBeforePath: Map<string, Category>
) {
  if (material.finalCategoryId && categoriesById.has(material.finalCategoryId)) {
    return categoriesById.get(material.finalCategoryId) || null;
  }
  if (material.categoryId && categoriesById.has(material.categoryId)) {
    return categoriesById.get(material.categoryId) || null;
  }
  return getUpdatedCategoryByPath(material.primaryCategory, categoriesByBeforePath) ||
    getUpdatedCategoryByPath(path.posix.dirname(material.relativePath), categoriesByBeforePath);
}

function getUpdatedCategoryByPath(relativePath: string | null | undefined, categoriesByBeforePath: Map<string, Category>) {
  if (!relativePath) return null;
  let current = relativePath;
  while (current && current !== ".") {
    const category = categoriesByBeforePath.get(current);
    if (category) return category;
    const parent = path.posix.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function replacePrefix(value: string | null | undefined, beforePath: string, afterPath: string) {
  if (!value) return null;
  if (value === beforePath) return afterPath;
  if (value.startsWith(`${beforePath}/`)) return `${afterPath}${value.slice(beforePath.length)}`;
  return null;
}

async function requireCategory(id: string) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new Error("目录不存在。");
  return category;
}

async function getSubtreeHeight(categoryId: string): Promise<number> {
  const children = await prisma.category.findMany({ where: { parentId: categoryId } });
  if (!children.length) return 1;
  const childHeights = await Promise.all(children.map((child) => getSubtreeHeight(child.id)));
  return 1 + Math.max(...childHeights);
}

async function assertDestinationAvailable(relativePath: string) {
  if (relativePath.split("/").length > MAX_DIRECTORY_DEPTH && !relativePath.startsWith(DIRECTORY_TRASH_DIR)) {
    throw new Error(`真实目录最多支持 ${MAX_DIRECTORY_DEPTH} 层。`);
  }
  const absolutePath = storageService.resolve(relativePath);
  try {
    await fs.access(absolutePath);
    throw new Error(`目标目录已存在：${relativePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function sanitizeSegment(value: string) {
  const segment = storageService.sanitizeFileName(value.trim()).replaceAll("/", "_");
  if (!segment) throw new Error("目录名称不能为空。");
  return segment.slice(0, 40);
}

async function writeCategoryMetadataJson(category: Category) {
  if (!category.relativePath) throw new Error("栏目没有绑定真实路径，无法写入 .category.json。");
  const metadataPath = storageService.resolve(path.posix.join(category.relativePath, CATEGORY_METADATA_FILE));
  const payload = {
    schemaVersion: 1,
    type: "category",
    id: category.id,
    code: category.code,
    name: category.name,
    workspaceId: category.workspaceId,
    parentId: category.parentId,
    assetType: category.assetType,
    directoryName: category.directoryName,
    storagePath: category.storagePath,
    relativePath: category.relativePath,
    physicalDirectory: category.physicalDirectory,
    level: category.level,
    depth: category.depth,
    sortOrder: category.sortOrder,
    status: category.status,
    isSystem: category.isSystem,
    allowUpload: category.allowUpload,
    aiDescription: category.aiDescription,
    notes: category.notes,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString()
  };
  try {
    await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2));
  } catch (error) {
    throw new Error(`写入 .category.json 失败：${(error as Error).message}`);
  }
}

export async function writeCategoryMetadataJsonForRepair(category: Category) {
  await writeCategoryMetadataJson(category);
}

async function removeDirectoryTree(absolutePath: string) {
  try {
    storageService.assertInsideRoot(absolutePath);
    await fs.rm(absolutePath, { recursive: true, force: true });
  } catch {
    // Best-effort rollback only. The caller receives the original creation error.
  }
}

async function logDirectoryOperation(data: {
  categoryId?: string;
  operationType: string;
  operatorName?: string;
  beforePath?: string;
  afterPath?: string;
  affectedMaterialCount?: number;
  notes?: string;
}) {
  return prisma.directoryOperationLog.create({
    data: {
      categoryId: data.categoryId,
      operationType: data.operationType,
      operatorName: normalizeOperatorName(data.operatorName),
      beforePath: data.beforePath,
      afterPath: data.afterPath,
      affectedMaterialCount: data.affectedMaterialCount ?? 0,
      notes: data.notes
    }
  });
}

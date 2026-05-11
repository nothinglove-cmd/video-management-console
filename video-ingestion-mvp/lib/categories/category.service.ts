import type { AssetType, Category, CategoryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  ASSET_TYPE_LABELS,
  BUSINESS_CATEGORIES,
  ROOT_CATEGORY_OPTIONS,
  getRootCategoryForDirectory,
  getSubCategoryLabelForDirectory
} from "@/lib/storage/storage.constants";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

export type CategoryInput = {
  name: string;
  assetType: AssetType;
  parentId?: string | null;
  relativePath?: string | null;
  physicalDirectory?: string | null;
  sortOrder?: number;
  allowUpload?: boolean;
  notes?: string | null;
};

export async function ensureDefaultCategories() {
  const roots = ROOT_CATEGORY_OPTIONS.filter((item) => item.value !== "AUTO");
  const workspaceContext = await getDefaultWorkspaceContext();

  for (const [rootIndex, root] of roots.entries()) {
    const rootCategory = await prisma.category.upsert({
      where: { code: root.rootDirectory },
      create: {
        workspaceId: workspaceContext.workspaceId,
        storageProviderId: workspaceContext.storageProviderId,
        code: root.rootDirectory,
        name: root.label,
        assetType: root.assetType as AssetType,
        directoryName: root.rootDirectory,
        storagePath: root.rootDirectory,
        level: 1,
        relativePath: root.rootDirectory,
        physicalDirectory: root.rootDirectory,
        sortOrder: (rootIndex + 1) * 100,
        depth: 1,
        isSystem: true,
        allowUpload: false
      },
      update: {
        directoryName: root.rootDirectory,
        storagePath: root.rootDirectory,
        level: 1,
        relativePath: root.rootDirectory,
        physicalDirectory: root.rootDirectory,
        depth: 1,
        isSystem: true,
        allowUpload: false
      }
    });
    if (!rootCategory.workspaceId || !rootCategory.storageProviderId) {
      await prisma.category.updateMany({
        where: { id: rootCategory.id },
        data: {
          workspaceId: rootCategory.workspaceId ?? workspaceContext.workspaceId,
          storageProviderId: rootCategory.storageProviderId ?? workspaceContext.storageProviderId
        }
      });
    }

    const categories = BUSINESS_CATEGORIES[root.assetType as AssetType] || [];
    for (const [index, directory] of categories.entries()) {
      const category = await prisma.category.upsert({
        where: { code: directory },
        create: {
          workspaceId: workspaceContext.workspaceId,
          storageProviderId: workspaceContext.storageProviderId,
          code: directory,
          name: getSubCategoryLabelForDirectory(directory),
          assetType: root.assetType as AssetType,
          parentId: rootCategory.id,
          directoryName: directory.split("/").at(-1) || directory,
          storagePath: directory,
          level: 2,
          relativePath: directory,
          physicalDirectory: directory,
          sortOrder: index + 1,
          depth: 2,
          isSystem: true,
          allowUpload: true
        },
        update: {
          directoryName: directory.split("/").at(-1) || directory,
          storagePath: directory,
          level: 2,
          relativePath: directory,
          physicalDirectory: directory,
          depth: 2,
          isSystem: true
        }
      });
      if (!category.workspaceId || !category.storageProviderId) {
        await prisma.category.updateMany({
          where: { id: category.id },
          data: {
            workspaceId: category.workspaceId ?? workspaceContext.workspaceId,
            storageProviderId: category.storageProviderId ?? workspaceContext.storageProviderId
          }
        });
      }
    }
  }
}

export async function listCategories() {
  await ensureDefaultCategories();
  const categories = await prisma.category.findMany({
    where: { NOT: { status: "DELETED" } },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      children: { where: { NOT: { status: "DELETED" } }, orderBy: { sortOrder: "asc" } },
      _count: { select: { children: true } }
    }
  });
  return Promise.all(categories.map(async (category) => ({
    ...category,
    childCount: category._count.children,
    materialCount: category.relativePath
      ? await prisma.material.count({ where: { relativePath: { startsWith: `${category.relativePath}/` }, NOT: { status: "TRASHED" } } })
      : 0,
    canDelete: !isProtectedRoot(category),
    canMove: !isProtectedRoot(category)
  })));
}

export function toCategoryTree(categories: Category[]) {
  const roots = categories.filter((item) => !item.parentId);
  const childrenByParent = new Map<string, Category[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenByParent.set(category.parentId, [...(childrenByParent.get(category.parentId) || []), category]);
  }
  return roots.map((root) => ({
    ...root,
    label: ASSET_TYPE_LABELS[root.assetType] || root.name,
    children: childrenByParent.get(root.id) || []
  }));
}

export async function createCategory(input: CategoryInput) {
  const parent = input.parentId ? await prisma.category.findUnique({ where: { id: input.parentId } }) : null;
  const workspaceContext = await getDefaultWorkspaceContext();
  const relativePath = input.relativePath?.trim() || input.physicalDirectory?.trim() || null;
  const code = relativePath || `${input.assetType}:${Date.now()}:${input.name.trim()}`;
  return prisma.category.create({
    data: {
      workspaceId: parent?.workspaceId ?? workspaceContext.workspaceId,
      storageProviderId: parent?.storageProviderId ?? workspaceContext.storageProviderId,
      code,
      name: input.name.trim(),
      assetType: input.assetType,
      parentId: parent?.id,
      directoryName: relativePath?.split("/").at(-1) || null,
      storagePath: relativePath,
      level: parent ? parent.depth + 1 : 1,
      relativePath,
      physicalDirectory: input.physicalDirectory?.trim() || relativePath,
      sortOrder: input.sortOrder ?? 100,
      depth: parent ? parent.depth + 1 : 1,
      allowUpload: input.allowUpload ?? true,
      notes: input.notes
    }
  });
}

export async function updateCategory(
  id: string,
  input: Partial<CategoryInput> & { status?: CategoryStatus }
) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new Error("栏目不存在。");
  if (isProtectedRoot(category)) {
    return prisma.category.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        sortOrder: input.sortOrder,
        allowUpload: false,
        status: input.status,
        notes: input.notes
      }
    });
  }
  return prisma.category.update({
    where: { id },
    data: {
      name: input.name?.trim(),
      assetType: input.assetType,
      parentId: input.parentId,
      directoryName: input.relativePath?.split("/").at(-1),
      storagePath: input.relativePath,
      level: input.relativePath?.split("/").length,
      relativePath: input.relativePath,
      physicalDirectory: input.physicalDirectory,
      sortOrder: input.sortOrder,
      allowUpload: input.allowUpload,
      status: input.status,
      notes: input.notes
    }
  });
}

export async function softDeleteCategory(id: string) {
  return prisma.category.update({
    where: { id },
    data: { status: "DELETED", allowUpload: false }
  });
}

export function rootCategoryValueForPath(path?: string | null) {
  return getRootCategoryForDirectory(path);
}

export function isProtectedRoot(category: Pick<Category, "relativePath" | "parentId">) {
  return !category.parentId && Boolean(category.relativePath) && [
    "02_账号素材",
    "03_产品素材",
    "04_对标视频",
    "07_公共资源"
  ].includes(category.relativePath || "");
}

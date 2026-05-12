import fs from "node:fs/promises";
import path from "node:path";
import type { Category } from "@prisma/client";

import { writeCategoryMetadataJsonForRepair } from "@/lib/directories/directory.service";
import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { prisma } from "@/lib/prisma";
import { getResolvedStorageRoot } from "@/lib/storage/storage-root-config.service";

const CATEGORY_METADATA_FILE = ".category.json";

type SyncableCategory = Pick<
  Category,
  | "id"
  | "code"
  | "name"
  | "status"
  | "storagePath"
  | "relativePath"
  | "physicalDirectory"
  | "directoryName"
>;

export type CategoryDirectorySyncItem = {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  status: string;
  relativePath: string;
  absolutePath: string;
  metadataRelativePath: string;
  directoryExists: boolean;
  metadataExists: boolean;
  metadataWillBeWritten: boolean;
};

export type CategoryDirectorySyncSkippedItem = {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  reason: string;
};

export type CategoryDirectorySyncPreview = {
  generatedAt: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  categoryTotal: number;
  syncableCount: number;
  existingDirectoryCount: number;
  missingDirectoryCount: number;
  categoryMetadataMissingCount: number;
  categoryMetadataRewriteCount: number;
  skippedCount: number;
  willDeleteDirectories: false;
  willMoveMaterials: false;
  willRestoreDefaultCategories: false;
  items: CategoryDirectorySyncItem[];
  skipped: CategoryDirectorySyncSkippedItem[];
  errors: string[];
};

export type CategoryDirectorySyncResult = {
  executedAt: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  createdDirectoryCount: number;
  existingDirectoryCount: number;
  metadataWrittenCount: number;
  skippedCount: number;
  failed: Array<{
    categoryId: string;
    categoryName: string;
    relativePath?: string;
    message: string;
  }>;
  preview: CategoryDirectorySyncPreview;
  message: string;
};

export async function previewCategoryDirectorySync(): Promise<CategoryDirectorySyncPreview> {
  const resolvedStorageRoot = await getResolvedStorageRoot();
  const categories = await prisma.category.findMany({
    where: { status: { in: ["ACTIVE", "DISABLED"] } },
    orderBy: [{ depth: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
  const items: CategoryDirectorySyncItem[] = [];
  const skipped: CategoryDirectorySyncSkippedItem[] = [];
  const errors: string[] = [];

  for (const category of categories) {
    const parsedPath = parseCategoryDirectory(category, resolvedStorageRoot.rootPath);
    if (!parsedPath.ok) {
      skipped.push({
        categoryId: category.id,
        categoryName: category.name,
        categoryCode: category.code,
        reason: parsedPath.error
      });
      continue;
    }

    try {
      const directoryExists = await isDirectory(parsedPath.absolutePath);
      const metadataRelativePath = toPosixPath(path.posix.join(parsedPath.relativePath, CATEGORY_METADATA_FILE));
      const metadataExists = directoryExists
        ? await exists(path.join(parsedPath.absolutePath, CATEGORY_METADATA_FILE))
        : false;

      items.push({
        categoryId: category.id,
        categoryName: category.name,
        categoryCode: category.code,
        status: category.status,
        relativePath: parsedPath.relativePath,
        absolutePath: parsedPath.absolutePath,
        metadataRelativePath,
        directoryExists,
        metadataExists,
        metadataWillBeWritten: true
      });
    } catch (error) {
      errors.push(`栏目「${category.name}」预览失败：${(error as Error).message}`);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    storageRoot: resolvedStorageRoot.rootPath,
    storageRootSource: resolvedStorageRoot.source,
    categoryTotal: categories.length,
    syncableCount: items.length,
    existingDirectoryCount: items.filter((item) => item.directoryExists).length,
    missingDirectoryCount: items.filter((item) => !item.directoryExists).length,
    categoryMetadataMissingCount: items.filter((item) => !item.metadataExists).length,
    categoryMetadataRewriteCount: items.filter((item) => item.metadataExists).length,
    skippedCount: skipped.length,
    willDeleteDirectories: false,
    willMoveMaterials: false,
    willRestoreDefaultCategories: false,
    items,
    skipped,
    errors
  };
}

export async function syncCategoryDirectories(input?: { operatorName?: unknown }): Promise<CategoryDirectorySyncResult> {
  const preview = await previewCategoryDirectorySync();
  let createdDirectoryCount = 0;
  let existingDirectoryCount = 0;
  let metadataWrittenCount = 0;
  const failed: CategoryDirectorySyncResult["failed"] = [];
  const categoriesById = new Map(
    await prisma.category.findMany({
      where: { id: { in: preview.items.map((item) => item.categoryId) } }
    }).then((categories) => categories.map((category) => [category.id, category]))
  );

  for (const item of preview.items) {
    const category = categoriesById.get(item.categoryId);
    if (!category) {
      failed.push({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        relativePath: item.relativePath,
        message: "栏目记录在执行前已不存在。"
      });
      continue;
    }

    try {
      if (item.directoryExists) {
        existingDirectoryCount += 1;
      } else {
        await fs.mkdir(item.absolutePath, { recursive: true });
        createdDirectoryCount += 1;
      }
      await writeCategoryMetadataJsonForRepair(category);
      metadataWrittenCount += 1;
      await logDirectorySync({
        categoryId: item.categoryId,
        operatorName: input?.operatorName,
        afterPath: item.relativePath,
        notes: "栏目目录同步：只创建缺失目录并写入/重写 .category.json；不删除、不移动、不恢复默认栏目。"
      });
    } catch (error) {
      failed.push({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        relativePath: item.relativePath,
        message: (error as Error).message
      });
    }
  }

  return {
    executedAt: new Date().toISOString(),
    storageRoot: preview.storageRoot,
    storageRootSource: preview.storageRootSource,
    createdDirectoryCount,
    existingDirectoryCount,
    metadataWrittenCount,
    skippedCount: preview.skippedCount,
    failed,
    preview,
    message: failed.length > 0
      ? `栏目目录同步完成，但有 ${failed.length} 个失败项。`
      : "栏目目录同步完成。建议继续运行系统修复里的“扫描目录”确认一致性。"
  };
}

function parseCategoryDirectory(category: SyncableCategory, storageRoot: string) {
  const rawPath = category.storagePath?.trim() ||
    category.relativePath?.trim() ||
    category.physicalDirectory?.trim() ||
    category.directoryName?.trim() ||
    "";

  if (!rawPath) {
    return { ok: false as const, error: "栏目没有可推导的 storagePath / relativePath / physicalDirectory / directoryName。" };
  }

  if (path.isAbsolute(rawPath)) {
    return { ok: false as const, error: `栏目路径必须是相对路径：${rawPath}` };
  }

  const normalized = toPosixPath(rawPath)
    .split("/")
    .filter((segment) => segment && segment !== ".")
    .join("/");

  if (!normalized) {
    return { ok: false as const, error: "栏目路径为空。" };
  }
  if (normalized.split("/").includes("..")) {
    return { ok: false as const, error: `栏目路径包含 .. 越界片段：${rawPath}` };
  }

  const absolutePath = path.resolve(storageRoot, normalized);
  if (!isInsideRoot(storageRoot, absolutePath)) {
    return { ok: false as const, error: `栏目路径越过 storage root：${rawPath}` };
  }

  return {
    ok: true as const,
    relativePath: normalized,
    absolutePath
  };
}

function toPosixPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isInsideRoot(storageRoot: string, targetPath: string) {
  const root = path.resolve(storageRoot);
  const target = path.resolve(targetPath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return target !== root && target.startsWith(rootWithSeparator);
}

async function exists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath: string) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function logDirectorySync(input: {
  categoryId: string;
  operatorName?: unknown;
  afterPath: string;
  notes: string;
}) {
  try {
    await prisma.directoryOperationLog.create({
      data: {
        categoryId: input.categoryId,
        operationType: "SYNC_CATEGORY_DIRECTORY",
        operatorName: normalizeOperatorName(typeof input.operatorName === "string" ? input.operatorName : undefined),
        afterPath: input.afterPath,
        affectedMaterialCount: 0,
        notes: input.notes
      }
    });
  } catch {
    // DirectoryOperationLog is operational telemetry only; sync itself should not fail because logging failed.
  }
}

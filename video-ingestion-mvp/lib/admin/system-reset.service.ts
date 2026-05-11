import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureDefaultCategories } from "@/lib/categories/category.service";
import { getStorageRoot } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { STORAGE_DIRECTORIES } from "@/lib/storage/storage.constants";
import { StorageService } from "@/lib/storage/storage.service";
import { ensureDefaultWorkspace } from "@/lib/workspace/default-workspace.service";

export const SYSTEM_RESET_CONFIRMATION = "PERMANENT_RESET_SYSTEM";

const PROJECT_ROOT = process.cwd();
const DEV_DB_PATH = path.join(PROJECT_ROOT, "prisma", "dev.db");

type TableCountKey =
  | "fileOperationLog"
  | "aiAnalysisJob"
  | "derivativeFile"
  | "ingestionJob"
  | "importBatch"
  | "material"
  | "shooter"
  | "directoryOperationLog"
  | "category"
  | "workspace"
  | "storageProvider"
  | "themePreset"
  | "menuConfig"
  | "terminologyPack"
  | "industryTemplate"
  | "namingTemplate"
  | "metadataSchema";

export type SystemResetPreview = {
  generatedAt: string;
  requiredConfirmation: typeof SYSTEM_RESET_CONFIRMATION;
  storageRoot: string;
  storageRootSafety: {
    ok: boolean;
    message: string;
  };
  storageRootTopLevel: {
    directoryCount: number;
    fileCount: number;
    entries: Array<{ name: string; type: "directory" | "file" | "symlink" | "other" }>;
  };
  storageRootRecursive: {
    directoryCount: number;
    fileCount: number;
  };
  hasRunningIngestionJob: boolean;
  counts: Record<TableCountKey, number>;
};

export type ExecuteSystemResetInput = {
  confirmation?: unknown;
  operatorName?: unknown;
  deleteStorageRootContents?: unknown;
};

export async function getSystemResetPreview(): Promise<SystemResetPreview> {
  const storageRoot = getStorageRoot();
  const [counts, hasRunningIngestionJob, storageSummary, storageRootSafety] = await Promise.all([
    getTableCounts(),
    prisma.ingestionJob.count({ where: { status: "RUNNING" } }).then((count) => count > 0),
    summarizeStorageRoot(storageRoot),
    validateStorageRoot(storageRoot)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    requiredConfirmation: SYSTEM_RESET_CONFIRMATION,
    storageRoot,
    storageRootSafety,
    storageRootTopLevel: storageSummary.topLevel,
    storageRootRecursive: storageSummary.recursive,
    hasRunningIngestionJob,
    counts
  };
}

export async function executeSystemReset(input: ExecuteSystemResetInput) {
  if (input.confirmation !== SYSTEM_RESET_CONFIRMATION) {
    throw new Error(`确认短语必须严格等于 ${SYSTEM_RESET_CONFIRMATION}。`);
  }
  if (input.deleteStorageRootContents !== true) {
    throw new Error("deleteStorageRootContents 必须为 true。");
  }

  const preview = await getSystemResetPreview();
  if (!preview.storageRootSafety.ok) {
    throw new Error(preview.storageRootSafety.message);
  }
  if (preview.hasRunningIngestionJob) {
    throw new Error("存在 RUNNING 入库任务。请先停止或等待后台任务完成后再执行系统初始化。");
  }

  const sqliteBackupPath = await backupSqliteDatabase();
  const deletedStorage = await clearStorageRootContents(preview.storageRoot);
  const deletedRecords = await clearDatabaseRecords();
  const defaults = await ensureDefaultWorkspace();
  await ensureDefaultCategories();
  const storageService = new StorageService();
  await storageService.initializeStorage();
  const rebuiltCounts = await getRebuiltDefaultCounts();

  return {
    executedAt: new Date().toISOString(),
    operatorName: typeof input.operatorName === "string" && input.operatorName.trim()
      ? input.operatorName.trim()
      : "本地管理员",
    sqliteBackupPath,
    storageRoot: preview.storageRoot,
    deletedStorage,
    deletedRecords,
    rebuiltDefaults: {
      workspaceCode: defaults.workspace.code,
      storageProviderCode: defaults.storageProvider.code,
      categoryCount: rebuiltCounts.categoryCount,
      standardDirectoryCount: rebuiltCounts.standardDirectoryCount
    },
    requiredConfirmation: SYSTEM_RESET_CONFIRMATION
  };
}

async function getTableCounts(): Promise<Record<TableCountKey, number>> {
  const [
    fileOperationLog,
    aiAnalysisJob,
    derivativeFile,
    ingestionJob,
    importBatch,
    material,
    shooter,
    directoryOperationLog,
    category,
    workspace,
    storageProvider,
    themePreset,
    menuConfig,
    terminologyPack,
    industryTemplate,
    namingTemplate,
    metadataSchema
  ] = await Promise.all([
    prisma.fileOperationLog.count(),
    prisma.aIAnalysisJob.count(),
    prisma.derivativeFile.count(),
    prisma.ingestionJob.count(),
    prisma.importBatch.count(),
    prisma.material.count(),
    prisma.shooter.count(),
    prisma.directoryOperationLog.count(),
    prisma.category.count(),
    prisma.workspace.count(),
    prisma.storageProvider.count(),
    prisma.themePreset.count(),
    prisma.menuConfig.count(),
    prisma.terminologyPack.count(),
    prisma.industryTemplate.count(),
    prisma.namingTemplate.count(),
    prisma.metadataSchema.count()
  ]);

  return {
    fileOperationLog,
    aiAnalysisJob,
    derivativeFile,
    ingestionJob,
    importBatch,
    material,
    shooter,
    directoryOperationLog,
    category,
    workspace,
    storageProvider,
    themePreset,
    menuConfig,
    terminologyPack,
    industryTemplate,
    namingTemplate,
    metadataSchema
  };
}

async function summarizeStorageRoot(storageRoot: string) {
  const safety = await validateStorageRoot(storageRoot);
  if (!safety.ok) {
    return {
      topLevel: { directoryCount: 0, fileCount: 0, entries: [] },
      recursive: { directoryCount: 0, fileCount: 0 }
    };
  }

  const entries = await fs.readdir(storageRoot, { withFileTypes: true });
  const topLevelEntries = entries.map((entry) => ({
    name: entry.name,
    type: direntType(entry)
  }));
  const recursive = { directoryCount: 0, fileCount: 0 };

  await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(storageRoot, entry.name);
    assertInsideRoot(storageRoot, childPath);
    const childCounts = await countRecursive(childPath);
    recursive.directoryCount += childCounts.directoryCount;
    recursive.fileCount += childCounts.fileCount;
  }));

  return {
    topLevel: {
      directoryCount: topLevelEntries.filter((entry) => entry.type === "directory").length,
      fileCount: topLevelEntries.filter((entry) => entry.type !== "directory").length,
      entries: topLevelEntries
    },
    recursive
  };
}

async function validateStorageRoot(storageRoot: string) {
  const raw = process.env.STORAGE_ROOT?.trim();
  const resolved = path.resolve(storageRoot || "");
  const home = path.resolve(os.homedir());
  const projectRoot = path.resolve(PROJECT_ROOT);

  if (!raw && !storageRoot) {
    return { ok: false, message: "STORAGE_ROOT 为空，拒绝执行。" };
  }
  if (!resolved || resolved === path.parse(resolved).root) {
    return { ok: false, message: `STORAGE_ROOT 指向危险路径：${resolved}` };
  }
  if (resolved === home) {
    return { ok: false, message: "STORAGE_ROOT 不能是用户 home 目录。" };
  }
  if (resolved === projectRoot || isAncestorPath(resolved, projectRoot)) {
    return { ok: false, message: "STORAGE_ROOT 不能是项目目录或项目目录的上级目录。" };
  }

  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    return { ok: false, message: `STORAGE_ROOT 不存在：${resolved}` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, message: `STORAGE_ROOT 不是目录：${resolved}` };
  }

  return { ok: true, message: "STORAGE_ROOT 路径校验通过。" };
}

async function backupSqliteDatabase() {
  await fs.access(DEV_DB_PATH);
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("");
  const basePath = `${DEV_DB_PATH}.system-reset-backup-${timestamp}`;
  const backupPath = await getUniqueBackupPath(basePath);
  await fs.copyFile(DEV_DB_PATH, backupPath);
  return backupPath;
}

async function getUniqueBackupPath(basePath: string) {
  let candidate = basePath;
  let index = 1;
  while (await pathExists(candidate)) {
    candidate = `${basePath}-${index}`;
    index += 1;
  }
  return candidate;
}

async function clearStorageRootContents(storageRoot: string) {
  const entries = await fs.readdir(storageRoot, { withFileTypes: true });
  const counts = { deletedTopLevelEntries: entries.length, deletedDirectories: 0, deletedFiles: 0 };

  for (const entry of entries) {
    const childPath = path.join(storageRoot, entry.name);
    assertInsideRoot(storageRoot, childPath);
    const childCounts = await countRecursive(childPath);
    counts.deletedDirectories += childCounts.directoryCount;
    counts.deletedFiles += childCounts.fileCount;
    await fs.rm(childPath, { recursive: true, force: true });
  }

  return counts;
}

async function clearDatabaseRecords() {
  const deletedRecordCounts = await getTableCounts();

  await prisma.$transaction([
    prisma.fileOperationLog.deleteMany(),
    prisma.aIAnalysisJob.deleteMany(),
    prisma.derivativeFile.deleteMany(),
    prisma.ingestionJob.deleteMany(),
    prisma.material.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.shooter.deleteMany(),
    prisma.directoryOperationLog.deleteMany(),
    prisma.category.deleteMany(),
    prisma.workspace.updateMany({
      data: {
        defaultStorageProviderId: null,
        themePresetId: null,
        menuConfigId: null,
        terminologyPackId: null,
        industryTemplateId: null
      }
    }),
    prisma.storageProvider.updateMany({ data: { workspaceId: null } }),
    prisma.workspace.deleteMany(),
    prisma.storageProvider.deleteMany(),
    prisma.themePreset.deleteMany(),
    prisma.menuConfig.deleteMany(),
    prisma.terminologyPack.deleteMany(),
    prisma.industryTemplate.deleteMany(),
    prisma.namingTemplate.deleteMany(),
    prisma.metadataSchema.deleteMany()
  ]);

  return deletedRecordCounts;
}

async function getRebuiltDefaultCounts() {
  const [categoryCount] = await Promise.all([
    prisma.category.count({ where: { NOT: { status: "DELETED" } } })
  ]);
  const storageService = new StorageService();
  const standardDirectoryChecks = await Promise.all(
    STORAGE_DIRECTORIES.map(async (directory) => {
      try {
        const stat = await fs.stat(storageService.resolve(directory));
        return stat.isDirectory();
      } catch {
        return false;
      }
    })
  );

  return {
    categoryCount,
    standardDirectoryCount: standardDirectoryChecks.filter(Boolean).length
  };
}

async function countRecursive(targetPath: string): Promise<{ directoryCount: number; fileCount: number }> {
  const stat = await fs.lstat(targetPath);
  if (!stat.isDirectory()) return { directoryCount: 0, fileCount: 1 };

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const counts = { directoryCount: 1, fileCount: 0 };
  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name);
    const childCounts = await countRecursive(childPath);
    counts.directoryCount += childCounts.directoryCount;
    counts.fileCount += childCounts.fileCount;
  }
  return counts;
}

function direntType(entry: import("node:fs").Dirent): "directory" | "file" | "symlink" | "other" {
  if (entry.isDirectory()) return "directory";
  if (entry.isFile()) return "file";
  if (entry.isSymbolicLink()) return "symlink";
  return "other";
}

function assertInsideRoot(storageRoot: string, targetPath: string) {
  const root = path.resolve(storageRoot);
  const target = path.resolve(targetPath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (target !== root && !target.startsWith(rootWithSeparator)) {
    throw new Error(`拒绝操作 STORAGE_ROOT 之外的路径：${target}`);
  }
}

function isAncestorPath(parentPath: string, childPath: string) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

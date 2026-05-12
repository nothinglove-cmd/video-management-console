import fs from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";

import { ensureDefaultCategories } from "@/lib/categories/category.service";
import { prisma } from "@/lib/prisma";
import { STORAGE_DIRECTORIES } from "@/lib/storage/storage.constants";
import {
  getResolvedStorageRoot,
  refreshResolvedStorageRoot
} from "@/lib/storage/storage-root-config.service";
import { StorageService } from "@/lib/storage/storage.service";
import {
  DEFAULT_INDUSTRY_TEMPLATE_CODE,
  DEFAULT_MENU_CODE,
  DEFAULT_STORAGE_PROVIDER_CODE,
  DEFAULT_TERMINOLOGY_CODE,
  DEFAULT_THEME_CODE,
  DEFAULT_WORKSPACE_CODE,
  ensureDefaultWorkspace
} from "@/lib/workspace/default-workspace.service";

export const SYSTEM_RESET_CONFIRMATION = "RESET_SYSTEM_KEEP_FILES";

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
  storageRootSource: "db" | "env";
  willDeleteStorageFiles: false;
  sqliteBackup: {
    required: true;
    pattern: string;
  };
  hasRunningIngestionJob: boolean;
  counts: Record<TableCountKey, number>;
  rebuilds: {
    workspaceCode: typeof DEFAULT_WORKSPACE_CODE;
    storageProviderCode: typeof DEFAULT_STORAGE_PROVIDER_CODE;
    themePresetCode: typeof DEFAULT_THEME_CODE;
    menuConfigCode: typeof DEFAULT_MENU_CODE;
    terminologyPackCode: typeof DEFAULT_TERMINOLOGY_CODE;
    industryTemplateCode: typeof DEFAULT_INDUSTRY_TEMPLATE_CODE;
    standardDirectoryCount: number;
    defaultCategories: true;
  };
};

export type ExecuteSystemResetInput = {
  confirmation?: unknown;
  operatorName?: unknown;
  deleteStorageRootContents?: unknown;
};

export async function getSystemResetPreview(): Promise<SystemResetPreview> {
  const resolvedStorageRoot = await getResolvedStorageRoot();
  const [counts, hasRunningIngestionJob] = await Promise.all([
    getTableCounts(),
    prisma.ingestionJob.count({ where: { status: "RUNNING" } }).then((count) => count > 0)
  ]);

  return {
    generatedAt: new Date().toISOString(),
    requiredConfirmation: SYSTEM_RESET_CONFIRMATION,
    storageRoot: resolvedStorageRoot.rootPath,
    storageRootSource: resolvedStorageRoot.source,
    willDeleteStorageFiles: false,
    sqliteBackup: {
      required: true,
      pattern: "prisma/dev.db.system-reset-backup-YYYYMMDD-HHMMSS"
    },
    hasRunningIngestionJob,
    counts,
    rebuilds: {
      workspaceCode: DEFAULT_WORKSPACE_CODE,
      storageProviderCode: DEFAULT_STORAGE_PROVIDER_CODE,
      themePresetCode: DEFAULT_THEME_CODE,
      menuConfigCode: DEFAULT_MENU_CODE,
      terminologyPackCode: DEFAULT_TERMINOLOGY_CODE,
      industryTemplateCode: DEFAULT_INDUSTRY_TEMPLATE_CODE,
      standardDirectoryCount: STORAGE_DIRECTORIES.length,
      defaultCategories: true
    }
  };
}

export async function executeSystemReset(input: ExecuteSystemResetInput) {
  if (input.confirmation !== SYSTEM_RESET_CONFIRMATION) {
    throw new Error(`确认短语必须严格等于 ${SYSTEM_RESET_CONFIRMATION}。`);
  }
  if (input.deleteStorageRootContents === true) {
    throw new Error("系统完全初始化不会删除物理文件，已拒绝 deleteStorageRootContents: true。");
  }

  const resolvedStorageRoot = await getResolvedStorageRoot();
  const preview = await getSystemResetPreview();
  if (preview.hasRunningIngestionJob) {
    throw new Error("存在 RUNNING 入库任务。请先停止或等待后台任务完成后再执行系统初始化。");
  }

  const sqliteBackupPath = await backupSqliteDatabase();
  const deletedRecords = await clearDatabaseRecords();
  const defaults = await rebuildDefaultsWithStorageRoot(resolvedStorageRoot.rootPath);
  await ensureDefaultCategories();
  await refreshResolvedStorageRoot();
  const storageService = new StorageService();
  await storageService.initializeStorage();
  const rebuiltCounts = await getRebuiltDefaultCounts();

  return {
    executedAt: new Date().toISOString(),
    operatorName: typeof input.operatorName === "string" && input.operatorName.trim()
      ? input.operatorName.trim()
      : "本地管理员",
    sqliteBackupPath,
    storageRoot: resolvedStorageRoot.rootPath,
    storageRootSource: resolvedStorageRoot.source,
    willDeleteStorageFiles: false,
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

async function rebuildDefaultsWithStorageRoot(storageRoot: string) {
  const defaults = await ensureDefaultWorkspace();
  const storageConfig = {
    storageRootSource: "system-reset-preserved-effective-root",
    containsSecrets: false
  } satisfies Record<string, unknown>;

  const storageProvider = await prisma.storageProvider.update({
    where: { code: DEFAULT_STORAGE_PROVIDER_CODE },
    data: {
      rootPath: storageRoot,
      config: storageConfig as Prisma.InputJsonValue,
      status: "ACTIVE"
    }
  });

  const workspace = await prisma.workspace.update({
    where: { code: DEFAULT_WORKSPACE_CODE },
    data: {
      storageRoot,
      defaultStorageProviderId: storageProvider.id,
      status: "ACTIVE"
    }
  });

  return {
    ...defaults,
    workspace,
    storageProvider
  };
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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

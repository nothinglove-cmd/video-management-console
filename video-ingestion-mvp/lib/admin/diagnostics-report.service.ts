import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";
import { getEnvironmentStatus } from "@/lib/admin/environment-status.service";
import { getNetworkAccessInfo } from "@/lib/network/access-info";
import { prisma } from "@/lib/prisma";
import { sanitizeUrlForDiagnostics } from "@/lib/security/redaction";
import { getStorageRootStatus } from "@/lib/storage/storage-root-config.service";

const STANDARD_STORAGE_DIRECTORIES = ["01_待导入", "99_回收站", "_derivatives"];

export type DiagnosticsReport = Awaited<ReturnType<typeof getDiagnosticsReport>>;

export async function getDiagnosticsReport() {
  const generatedAt = new Date();
  const [packageInfo, environmentStatus, accessInfo, storageRootStatus, ai, counts, workspaceSummary, standardDirectoriesStatus, devDbExists] = await Promise.all([
    readPackageInfo(),
    getEnvironmentStatus(),
    Promise.resolve(getNetworkAccessInfo()),
    getStorageRootStatus(),
    aiProviderConfigService.getPublicResolvedConfig(),
    getDatabaseCounts(),
    getWorkspaceSummary(),
    getStandardDirectoriesStatus(),
    fileExists(path.join(process.cwd(), "prisma", "dev.db")),
  ]);

  return {
    generatedAt: generatedAt.toISOString(),
    app: {
      packageName: packageInfo.name,
      packageVersion: packageInfo.version,
      nodeEnv: process.env.NODE_ENV || "development",
      platform: process.platform,
      nodeVersion: process.version,
    },
    database: {
      provider: "sqlite",
      databaseUrlType: getDatabaseUrlType(),
      devDbExists,
      counts,
    },
    workspace: workspaceSummary,
    storage: {
      effectiveRoot: storageRootStatus.rootPath,
      source: storageRootStatus.source,
      materialCount: storageRootStatus.materialCount,
      derivativeFileCount: storageRootStatus.derivativeFileCount,
      defaultStorageProvider: storageRootStatus.storageProvider
        ? {
            code: storageRootStatus.storageProvider.code,
            name: storageRootStatus.storageProvider.name,
            type: storageRootStatus.storageProvider.type,
            status: storageRootStatus.storageProvider.status,
          }
        : null,
      standardDirectoriesStatus,
    },
    mediaTools: environmentStatus.mediaTools,
    ai: {
      provider: ai.provider,
      model: ai.model,
      source: ai.source,
      fallbackProvider: ai.fallbackProvider,
      baseUrl: sanitizeUrlForDiagnostics(ai.baseUrl),
      volcengineBaseUrl: sanitizeUrlForDiagnostics(ai.volcengineBaseUrl),
      localBaseUrl: sanitizeUrlForDiagnostics(ai.localBaseUrl),
      localModel: ai.localModel,
      localHealthcheckUrl: sanitizeUrlForDiagnostics(ai.localHealthcheckUrl),
      frameMax: ai.frameMax,
      imageDetail: ai.imageDetail,
      requestTimeoutMs: ai.requestTimeoutMs,
      openaiApiKeyConfigured: ai.openaiApiKeyConfigured,
      arkApiKeyConfigured: ai.arkApiKeyConfigured,
      localApiKeyConfigured: ai.localApiKeyConfigured,
    },
    network: {
      port: accessInfo.port,
      localhostUrl: accessInfo.localhostUrl,
      localhostMobileUploadUrl: accessInfo.localhostMobileUploadUrl,
      lanAddresses: accessInfo.addresses.map((item) => ({
        interfaceName: item.interfaceName,
        address: item.address,
        family: item.family,
        url: item.url,
        mobileUploadUrl: item.mobileUploadUrl,
      })),
    },
    repair: {
      latestScanPersisted: false,
      onDemandScanExecuted: false,
      note: "诊断报告不执行 repair scan，也不保存或修复巡检结果；如需详细问题列表，请在设置页手动运行存储巡检。",
    },
  };
}

export function buildDiagnosticsFileName(dateInput: Date | string = new Date()) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
  return `video-ingestion-diagnostics-${stamp}.json`;
}

async function readPackageInfo() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
    return {
      name: typeof parsed.name === "string" ? parsed.name : "video-ingestion-mvp",
      version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
    };
  } catch {
    return {
      name: "video-ingestion-mvp",
      version: "unknown",
    };
  }
}

async function getDatabaseCounts() {
  const [
    materials,
    categories,
    shooters,
    importBatches,
    ingestionJobs,
    derivativeFiles,
    aiAnalysisJobs,
    workspaces,
    storageProviders,
    aiProviderConfigs,
  ] = await Promise.all([
    prisma.material.count(),
    prisma.category.count(),
    prisma.shooter.count(),
    prisma.importBatch.count(),
    prisma.ingestionJob.count(),
    prisma.derivativeFile.count(),
    prisma.aIAnalysisJob.count(),
    prisma.workspace.count(),
    prisma.storageProvider.count(),
    prisma.aIProviderConfig.count({ where: { status: "ACTIVE" } }).catch(() => 0),
  ]);

  return {
    materials,
    categories,
    shooters,
    importBatches,
    ingestionJobs,
    derivativeFiles,
    aiAnalysisJobs,
    workspaces,
    storageProviders,
    aiProviderConfigs,
  };
}

async function getWorkspaceSummary() {
  const workspace = await prisma.workspace.findUnique({
    where: { code: "default" },
    include: {
      defaultStorageProvider: true,
      themePreset: true,
      menuConfig: true,
      terminologyPack: true,
      industryTemplate: true,
    },
  });

  const missingBindings = workspace
    ? [
        workspace.defaultStorageProvider ? null : "defaultStorageProvider",
        workspace.themePreset ? null : "themePreset",
        workspace.menuConfig ? null : "menuConfig",
        workspace.terminologyPack ? null : "terminologyPack",
        workspace.industryTemplate ? null : "industryTemplate",
      ].filter((item): item is string => Boolean(item))
    : ["workspace"];

  return {
    defaultWorkspaceExists: Boolean(workspace),
    storageProviderExists: Boolean(workspace?.defaultStorageProvider),
    code: workspace?.code ?? null,
    name: workspace?.name ?? null,
    status: workspace?.status ?? null,
    missingBindings,
  };
}

async function getStandardDirectoriesStatus() {
  const storageRootStatus = await getStorageRootStatus();
  return Promise.all(
    STANDARD_STORAGE_DIRECTORIES.map(async (relativePath) => {
      const absolutePath = path.join(storageRootStatus.rootPath, relativePath);
      try {
        const stat = await fs.stat(absolutePath);
        return {
          relativePath,
          exists: true,
          isDirectory: stat.isDirectory(),
        };
      } catch {
        return {
          relativePath,
          exists: false,
          isDirectory: false,
        };
      }
    })
  );
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getDatabaseUrlType() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) return "missing";
  if (value.startsWith("file:")) return "file";
  return "other";
}

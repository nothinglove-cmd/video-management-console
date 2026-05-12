import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";

import { getStorageRoot } from "@/lib/config";
import { prisma } from "@/lib/prisma";

const DEFAULT_WORKSPACE_CODE = "default";
const DEFAULT_STORAGE_PROVIDER_CODE = "local-default";
const REQUIRED_STORAGE_DIRECTORIES = ["01_待导入", "99_回收站", "_derivatives"];
const DISALLOWED_PROTOCOLS = ["smb", "webdav", "http", "https", "s3", "oss", "minio"];
const MATERIAL_MISSING_SAMPLE_LIMIT = 20;

export type StorageRootSource = "db" | "env";

export type ResolvedStorageRoot = {
  rootPath: string;
  source: StorageRootSource;
  envRootPath: string;
  workspace: {
    id: string;
    code: string;
    name: string;
    storageRoot: string | null;
  } | null;
  storageProvider: {
    id: string;
    code: string;
    name: string;
    type: string;
    rootPath: string | null;
    status: string;
  } | null;
};

export type StorageRootCheckResult = {
  ok: boolean;
  rootPath: string;
  resolvedRootPath: string | null;
  errors: string[];
  warnings: string[];
  requiredDirectories: Array<{
    relativePath: string;
    exists: boolean;
    isDirectory: boolean;
  }>;
  materialFileCheck: {
    totalMaterials: number;
    checkedMaterials: number;
    existingFiles: number;
    missingFiles: number;
    sampleMissingPaths: string[];
  };
};

export type StorageRootStatus = ResolvedStorageRoot & {
  materialCount: number;
  derivativeFileCount: number;
  notes: string[];
};

export type ApplyStorageRootResult = {
  oldRoot: string;
  newRoot: string;
  materialUpdatedCount: number;
  derivativeUpdatedCount: number;
  checkResult: StorageRootCheckResult;
};

export class StorageRootConfigError extends Error {
  constructor(message: string, readonly checkResult?: StorageRootCheckResult) {
    super(message);
    this.name = "StorageRootConfigError";
  }
}

let cachedResolvedStorageRoot: Pick<ResolvedStorageRoot, "rootPath" | "source" | "envRootPath"> = {
  rootPath: getStorageRoot(),
  source: "env",
  envRootPath: getStorageRoot()
};

export function getEnvStorageRoot() {
  return getStorageRoot();
}

export function getCachedResolvedStorageRoot() {
  return cachedResolvedStorageRoot;
}

function setCachedResolvedStorageRoot(rootPath: string, source: StorageRootSource) {
  cachedResolvedStorageRoot = {
    rootPath: path.resolve(rootPath),
    source,
    envRootPath: getEnvStorageRoot()
  };
}

export async function getResolvedStorageRoot(): Promise<ResolvedStorageRoot> {
  const envRootPath = getEnvStorageRoot();
  const workspace = await prisma.workspace.findUnique({
    where: { code: DEFAULT_WORKSPACE_CODE },
    include: { defaultStorageProvider: true }
  });
  const fallbackProvider = workspace?.defaultStorageProvider
    ? null
    : await prisma.storageProvider.findUnique({ where: { code: DEFAULT_STORAGE_PROVIDER_CODE } });
  const storageProvider = workspace?.defaultStorageProvider ?? fallbackProvider;
  const dbRootPath = storageProvider?.rootPath?.trim();
  const rootPath = path.resolve(dbRootPath || envRootPath);
  const source: StorageRootSource = dbRootPath ? "db" : "env";

  setCachedResolvedStorageRoot(rootPath, source);

  return {
    rootPath,
    source,
    envRootPath,
    workspace: workspace
      ? {
          id: workspace.id,
          code: workspace.code,
          name: workspace.name,
          storageRoot: workspace.storageRoot
        }
      : null,
    storageProvider: storageProvider
      ? {
          id: storageProvider.id,
          code: storageProvider.code,
          name: storageProvider.name,
          type: storageProvider.type,
          rootPath: storageProvider.rootPath,
          status: storageProvider.status
        }
      : null
  };
}

export async function refreshResolvedStorageRoot() {
  return getResolvedStorageRoot();
}

export async function getStorageRootStatus(): Promise<StorageRootStatus> {
  const [resolved, materialCount, derivativeFileCount] = await Promise.all([
    getResolvedStorageRoot(),
    prisma.material.count(),
    prisma.derivativeFile.count()
  ]);
  const notes = [
    "V1 仅支持 Node.js fs 可读写的本地路径。",
    "NAS / SMB / WebDAV 需先由操作系统挂载为本地目录路径。"
  ];

  return {
    ...resolved,
    materialCount,
    derivativeFileCount,
    notes
  };
}

export async function checkStorageRootCandidate(inputRootPath: string): Promise<StorageRootCheckResult> {
  const rootPath = typeof inputRootPath === "string" ? inputRootPath.trim() : "";
  const errors: string[] = [];
  const warnings: string[] = [];
  const requiredDirectories: StorageRootCheckResult["requiredDirectories"] = [];
  const materialFileCheck: StorageRootCheckResult["materialFileCheck"] = {
    totalMaterials: 0,
    checkedMaterials: 0,
    existingFiles: 0,
    missingFiles: 0,
    sampleMissingPaths: []
  };

  if (!rootPath) {
    errors.push("存储根目录不能为空。");
    return buildCheckResult(rootPath, null, errors, warnings, requiredDirectories, materialFileCheck);
  }

  const protocol = rootPath.match(/^([a-z][a-z0-9+.-]*):\/\//i)?.[1]?.toLowerCase();
  if (protocol && DISALLOWED_PROTOCOLS.includes(protocol)) {
    errors.push(`V1 不支持直接填写 ${protocol}:// 协议地址，请先由操作系统挂载为本地路径。`);
  }

  if (!path.isAbsolute(rootPath)) {
    errors.push("存储根目录必须是绝对路径。");
    return buildCheckResult(rootPath, null, errors, warnings, requiredDirectories, materialFileCheck);
  }

  const resolvedRootPath = path.resolve(rootPath);
  validateDangerousRoot(resolvedRootPath, errors);

  if (errors.length === 0) {
    await validateExistingWritableDirectory(resolvedRootPath, errors);
  }

  if (errors.length === 0) {
    requiredDirectories.push(...await checkRequiredDirectories(resolvedRootPath));
    if (requiredDirectories.some((item) => !item.exists || !item.isDirectory)) {
      warnings.push("候选目录缺少部分标准子目录，保存后建议运行存储巡检确认。");
    }
    await checkMaterialFiles(resolvedRootPath, materialFileCheck);
    if (materialFileCheck.missingFiles > 0) {
      warnings.push("部分数据库素材在候选根目录下不存在，切换后需运行 repair scan 确认。");
    }
  }

  return buildCheckResult(rootPath, resolvedRootPath, errors, warnings, requiredDirectories, materialFileCheck);
}

export async function applyStorageRoot(rootPath: string): Promise<ApplyStorageRootResult> {
  const checkResult = await checkStorageRootCandidate(rootPath);
  if (!checkResult.ok || !checkResult.resolvedRootPath) {
    throw new StorageRootConfigError("存储根目录检查未通过，已拒绝保存。", checkResult);
  }

  const resolved = await getResolvedStorageRoot();
  const provider = resolved.storageProvider
    ? await prisma.storageProvider.findUnique({ where: { id: resolved.storageProvider.id } })
    : await prisma.storageProvider.findUnique({ where: { code: DEFAULT_STORAGE_PROVIDER_CODE } });
  const workspace = await prisma.workspace.findUnique({
    where: { code: DEFAULT_WORKSPACE_CODE }
  });

  if (!provider || !workspace) {
    throw new StorageRootConfigError("默认 workspace 或 StorageProvider 不存在，请先运行 npm run init:workspace。", checkResult);
  }

  const newRoot = checkResult.resolvedRootPath;
  const [materials, derivativeFiles] = await Promise.all([
    prisma.material.findMany({ select: { id: true, relativePath: true, absolutePath: true } }),
    prisma.derivativeFile.findMany({ select: { id: true, relativePath: true, absolutePath: true } })
  ]);

  let materialUpdatedCount = 0;
  let derivativeUpdatedCount = 0;

  await prisma.$transaction(async (tx) => {
    await tx.storageProvider.update({
      where: { id: provider.id },
      data: {
        rootPath: newRoot,
        config: toJson({
          ...jsonObject(provider.config),
          storageRootSource: "admin-settings",
          containsSecrets: false
        })
      }
    });

    await tx.workspace.update({
      where: { id: workspace.id },
      data: { storageRoot: newRoot }
    });

    for (const material of materials) {
      const absolutePath = resolveRelativeUnderRoot(newRoot, material.relativePath);
      if (material.absolutePath !== absolutePath) {
        await tx.material.update({
          where: { id: material.id },
          data: { absolutePath }
        });
        materialUpdatedCount += 1;
      }
    }

    for (const derivativeFile of derivativeFiles) {
      const absolutePath = resolveRelativeUnderRoot(newRoot, derivativeFile.relativePath);
      if (derivativeFile.absolutePath !== absolutePath) {
        await tx.derivativeFile.update({
          where: { id: derivativeFile.id },
          data: { absolutePath }
        });
        derivativeUpdatedCount += 1;
      }
    }
  });

  setCachedResolvedStorageRoot(newRoot, "db");

  return {
    oldRoot: resolved.rootPath,
    newRoot,
    materialUpdatedCount,
    derivativeUpdatedCount,
    checkResult
  };
}

function buildCheckResult(
  rootPath: string,
  resolvedRootPath: string | null,
  errors: string[],
  warnings: string[],
  requiredDirectories: StorageRootCheckResult["requiredDirectories"],
  materialFileCheck: StorageRootCheckResult["materialFileCheck"]
): StorageRootCheckResult {
  return {
    ok: errors.length === 0,
    rootPath,
    resolvedRootPath,
    errors,
    warnings,
    requiredDirectories,
    materialFileCheck
  };
}

function validateDangerousRoot(resolvedRootPath: string, errors: string[]) {
  const projectRoot = path.resolve(process.cwd());
  const projectParent = path.dirname(projectRoot);
  const homeRoot = path.resolve(os.homedir());
  const rootWithSeparator = appendSeparator(projectRoot);
  const internalDirectories = [".next", "node_modules", "prisma"].map((directory) => path.join(projectRoot, directory));

  if (resolvedRootPath === path.parse(resolvedRootPath).root) {
    errors.push("禁止把系统根目录作为存储根目录。");
  }
  if (resolvedRootPath === homeRoot) {
    errors.push("禁止把用户 home 根目录本身作为存储根目录。");
  }
  if (resolvedRootPath === projectRoot) {
    errors.push("禁止把项目目录作为存储根目录。");
  }
  if (resolvedRootPath === projectParent) {
    errors.push("禁止把项目上级目录作为存储根目录。");
  }
  if (resolvedRootPath.startsWith(rootWithSeparator)) {
    errors.push("禁止把项目内部目录作为存储根目录。");
  }
  if (internalDirectories.includes(resolvedRootPath)) {
    errors.push("禁止把 .next、node_modules 或 prisma 等项目内部目录作为存储根目录。");
  }
}

async function validateExistingWritableDirectory(resolvedRootPath: string, errors: string[]) {
  try {
    const stat = await fs.stat(resolvedRootPath);
    if (!stat.isDirectory()) {
      errors.push("存储根目录必须是已存在的目录。");
      return;
    }
  } catch {
    errors.push("存储根目录必须存在。");
    return;
  }

  try {
    await fs.access(resolvedRootPath, fsConstants.R_OK);
  } catch {
    errors.push("服务进程对存储根目录没有读取权限。");
  }

  try {
    await fs.access(resolvedRootPath, fsConstants.W_OK);
  } catch {
    errors.push("服务进程对存储根目录没有写入权限。");
  }

  const checkFilePath = path.join(resolvedRootPath, `.storage-root-check-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  let created = false;
  try {
    await fs.writeFile(checkFilePath, "storage-root-check\n", { flag: "wx" });
    created = true;
  } catch {
    errors.push("存储根目录写入测试失败。");
  } finally {
    if (created) {
      try {
        await fs.unlink(checkFilePath);
      } catch {
        errors.push("存储根目录测试文件清理失败，请检查目录权限。");
      }
    }
  }
}

async function checkRequiredDirectories(rootPath: string) {
  return Promise.all(REQUIRED_STORAGE_DIRECTORIES.map(async (relativePath) => {
    const absolutePath = path.join(rootPath, relativePath);
    try {
      const stat = await fs.stat(absolutePath);
      return {
        relativePath,
        exists: true,
        isDirectory: stat.isDirectory()
      };
    } catch {
      return {
        relativePath,
        exists: false,
        isDirectory: false
      };
    }
  }));
}

async function checkMaterialFiles(rootPath: string, result: StorageRootCheckResult["materialFileCheck"]) {
  const materials = await prisma.material.findMany({
    select: {
      materialId: true,
      relativePath: true
    }
  });

  result.totalMaterials = materials.length;
  result.checkedMaterials = materials.length;

  for (const material of materials) {
    const absolutePath = resolveRelativeUnderRoot(rootPath, material.relativePath);
    try {
      await fs.access(absolutePath, fsConstants.F_OK);
      result.existingFiles += 1;
    } catch {
      result.missingFiles += 1;
      if (result.sampleMissingPaths.length < MATERIAL_MISSING_SAMPLE_LIMIT) {
        result.sampleMissingPaths.push(material.relativePath);
      }
    }
  }
}

function resolveRelativeUnderRoot(rootPath: string, relativePath: string) {
  const root = path.resolve(rootPath);
  const normalizedRelativePath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const absolutePath = path.resolve(root, normalizedRelativePath);
  if (absolutePath !== root && !absolutePath.startsWith(appendSeparator(root))) {
    throw new StorageRootConfigError(`数据库相对路径越过存储根目录：${relativePath}`);
  }
  return absolutePath;
}

function appendSeparator(inputPath: string) {
  return inputPath.endsWith(path.sep) ? inputPath : `${inputPath}${path.sep}`;
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

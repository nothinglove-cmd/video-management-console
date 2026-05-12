import { Prisma } from "@prisma/client";

import { DEFAULT_INDUSTRY_TEMPLATE } from "../app-config/default-industry-template";
import { DEFAULT_MENU_ITEMS } from "../app-config/default-menu";
import { DEFAULT_TERMINOLOGY } from "../app-config/default-terminology";
import { DEFAULT_THEME } from "../app-config/default-theme";
import { prisma } from "../prisma";
import { getEnvStorageRoot } from "../storage/storage-root-config.service";

export const DEFAULT_WORKSPACE_CODE = "default";
export const DEFAULT_STORAGE_PROVIDER_CODE = "local-default";
export const DEFAULT_THEME_CODE = "default";
export const DEFAULT_MENU_CODE = "default";
export const DEFAULT_TERMINOLOGY_CODE = "default";
export const DEFAULT_INDUSTRY_TEMPLATE_CODE = "short-video-team-default";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function ensureDefaultWorkspace() {
  const envStorageRoot = getEnvStorageRoot();
  const existingStorageProvider = await prisma.storageProvider.findUnique({
    where: { code: DEFAULT_STORAGE_PROVIDER_CODE }
  });
  const existingWorkspace = await prisma.workspace.findUnique({
    where: { code: DEFAULT_WORKSPACE_CODE }
  });
  const storageRoot = existingStorageProvider?.rootPath?.trim() || envStorageRoot;
  const workspaceStorageRoot = existingWorkspace?.storageRoot?.trim() || storageRoot;

  const themePreset = await prisma.themePreset.upsert({
    where: { code: DEFAULT_THEME_CODE },
    create: {
      code: DEFAULT_THEME_CODE,
      name: DEFAULT_THEME.appName,
      config: toJson(DEFAULT_THEME),
      status: "ACTIVE"
    },
    update: {
      name: DEFAULT_THEME.appName,
      config: toJson(DEFAULT_THEME),
      status: "ACTIVE"
    }
  });

  const menuConfig = await prisma.menuConfig.upsert({
    where: { code: DEFAULT_MENU_CODE },
    create: {
      code: DEFAULT_MENU_CODE,
      name: "默认菜单",
      config: toJson({ items: DEFAULT_MENU_ITEMS }),
      status: "ACTIVE"
    },
    update: {
      name: "默认菜单",
      config: toJson({ items: DEFAULT_MENU_ITEMS }),
      status: "ACTIVE"
    }
  });

  const terminologyPack = await prisma.terminologyPack.upsert({
    where: { code: DEFAULT_TERMINOLOGY_CODE },
    create: {
      code: DEFAULT_TERMINOLOGY_CODE,
      name: "默认术语包",
      terms: toJson(DEFAULT_TERMINOLOGY),
      status: "ACTIVE"
    },
    update: {
      name: "默认术语包",
      terms: toJson(DEFAULT_TERMINOLOGY),
      status: "ACTIVE"
    }
  });

  const industryTemplate = await prisma.industryTemplate.upsert({
    where: { code: DEFAULT_INDUSTRY_TEMPLATE_CODE },
    create: {
      code: DEFAULT_INDUSTRY_TEMPLATE_CODE,
      name: DEFAULT_INDUSTRY_TEMPLATE.name,
      description: DEFAULT_INDUSTRY_TEMPLATE.description,
      config: toJson(DEFAULT_INDUSTRY_TEMPLATE),
      status: "ACTIVE"
    },
    update: {
      name: DEFAULT_INDUSTRY_TEMPLATE.name,
      description: DEFAULT_INDUSTRY_TEMPLATE.description,
      config: toJson(DEFAULT_INDUSTRY_TEMPLATE),
      status: "ACTIVE"
    }
  });

  const storageProvider = await prisma.storageProvider.upsert({
    where: { code: DEFAULT_STORAGE_PROVIDER_CODE },
    create: {
      code: DEFAULT_STORAGE_PROVIDER_CODE,
      name: "默认本地存储",
      type: "LOCAL",
      rootPath: storageRoot,
      config: toJson({
        storageRootSource: "STORAGE_ROOT",
        containsSecrets: false
      }),
      status: "ACTIVE"
    },
    update: {
      name: "默认本地存储",
      type: "LOCAL",
      rootPath: storageRoot,
      status: "ACTIVE"
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: { code: DEFAULT_WORKSPACE_CODE },
    create: {
      code: DEFAULT_WORKSPACE_CODE,
      name: "默认工作空间",
      storageRoot: workspaceStorageRoot,
      defaultStorageProviderId: storageProvider.id,
      themePresetId: themePreset.id,
      menuConfigId: menuConfig.id,
      terminologyPackId: terminologyPack.id,
      industryTemplateId: industryTemplate.id,
      status: "ACTIVE",
      notes: "单 workspace 第一版默认配置。"
    },
    update: {
      name: "默认工作空间",
      storageRoot: workspaceStorageRoot,
      defaultStorageProviderId: storageProvider.id,
      themePresetId: themePreset.id,
      menuConfigId: menuConfig.id,
      terminologyPackId: terminologyPack.id,
      industryTemplateId: industryTemplate.id,
      status: "ACTIVE"
    }
  });

  const boundStorageProvider =
    storageProvider.workspaceId === workspace.id
      ? storageProvider
      : await prisma.storageProvider.update({
          where: { id: storageProvider.id },
          data: { workspaceId: workspace.id }
        });

  return {
    workspace,
    storageProvider: boundStorageProvider,
    themePreset,
    menuConfig,
    terminologyPack,
    industryTemplate,
    storageRoot
  };
}

export async function getDefaultWorkspaceContext() {
  const defaults = await ensureDefaultWorkspace();
  return {
    workspaceId: defaults.workspace.id,
    storageProviderId: defaults.storageProvider.id
  };
}

export async function backfillDefaultWorkspace() {
  const defaults = await ensureDefaultWorkspace();
  const workspaceId = defaults.workspace.id;
  const storageProviderId = defaults.storageProvider.id;

  const [
    categoryWorkspace,
    materialWorkspace,
    importBatchWorkspace,
    ingestionJobWorkspace,
    shooterWorkspace,
    derivativeFileWorkspace,
    aiAnalysisJobWorkspace,
    categoryStorageProvider,
    materialStorageProvider,
    derivativeFileStorageProvider
  ] = await prisma.$transaction([
    prisma.category.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.material.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.importBatch.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.ingestionJob.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.shooter.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.derivativeFile.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.aIAnalysisJob.updateMany({
      where: { workspaceId: null },
      data: { workspaceId }
    }),
    prisma.category.updateMany({
      where: { storageProviderId: null },
      data: { storageProviderId }
    }),
    prisma.material.updateMany({
      where: { storageProviderId: null },
      data: { storageProviderId }
    }),
    prisma.derivativeFile.updateMany({
      where: { storageProviderId: null },
      data: { storageProviderId }
    })
  ]);

  return {
    workspace: defaults.workspace,
    storageProvider: defaults.storageProvider,
    counts: {
      categoryWorkspace: categoryWorkspace.count,
      materialWorkspace: materialWorkspace.count,
      importBatchWorkspace: importBatchWorkspace.count,
      ingestionJobWorkspace: ingestionJobWorkspace.count,
      shooterWorkspace: shooterWorkspace.count,
      derivativeFileWorkspace: derivativeFileWorkspace.count,
      aiAnalysisJobWorkspace: aiAnalysisJobWorkspace.count,
      categoryStorageProvider: categoryStorageProvider.count,
      materialStorageProvider: materialStorageProvider.count,
      derivativeFileStorageProvider: derivativeFileStorageProvider.count
    }
  };
}

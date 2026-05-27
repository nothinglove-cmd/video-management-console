import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { prisma } from "@/lib/prisma";
import { ensureDefaultWorkspace } from "@/lib/workspace/default-workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickConfigStatus<T extends {
  code: string;
  name: string;
  status: string;
}>(record: T | null | undefined) {
  if (!record) return null;
  return {
    code: record.code,
    name: record.name,
    status: record.status
  };
}

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const defaults = await ensureDefaultWorkspace();
  const workspace = await prisma.workspace.findUnique({
    where: { id: defaults.workspace.id },
    include: {
      defaultStorageProvider: true,
      themePreset: true,
      menuConfig: true,
      terminologyPack: true,
      industryTemplate: true
    }
  });

  const [
    categoryNullWorkspaceCount,
    materialNullWorkspaceCount,
    importBatchNullWorkspaceCount,
    ingestionJobNullWorkspaceCount
  ] = await Promise.all([
    prisma.category.count({ where: { workspaceId: null } }),
    prisma.material.count({ where: { workspaceId: null } }),
    prisma.importBatch.count({ where: { workspaceId: null } }),
    prisma.ingestionJob.count({ where: { workspaceId: null } })
  ]);

  const missingBindings = {
    workspace: !workspace,
    storageProvider: !workspace?.defaultStorageProvider,
    themePreset: !workspace?.themePreset,
    menuConfig: !workspace?.menuConfig,
    terminologyPack: !workspace?.terminologyPack,
    industryTemplate: !workspace?.industryTemplate
  };

  return NextResponse.json({
    mode: "single-workspace",
    workspace: workspace
      ? {
          code: workspace.code,
          name: workspace.name,
          status: workspace.status
        }
      : null,
    storageProvider: workspace?.defaultStorageProvider
      ? {
          code: workspace.defaultStorageProvider.code,
          name: workspace.defaultStorageProvider.name,
          type: workspace.defaultStorageProvider.type,
          rootPath: workspace.defaultStorageProvider.rootPath,
          status: workspace.defaultStorageProvider.status
        }
      : null,
    themePreset: pickConfigStatus(workspace?.themePreset),
    menuConfig: pickConfigStatus(workspace?.menuConfig),
    terminologyPack: pickConfigStatus(workspace?.terminologyPack),
    industryTemplate: pickConfigStatus(workspace?.industryTemplate),
    missingBindings,
    hasMissingBindings: Object.values(missingBindings).some(Boolean),
    nullWorkspaceCounts: {
      category: categoryNullWorkspaceCount,
      material: materialNullWorkspaceCount,
      importBatch: importBatchNullWorkspaceCount,
      ingestionJob: ingestionJobNullWorkspaceCount
    }
  });
}

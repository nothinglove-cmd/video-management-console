import { randomBytes } from "node:crypto";
import type { FinishedWork, Material, MaterialPackage, MaterialPackageItem, MaterialPackageStatus, MaterialUsage } from "@prisma/client";

import { byteSizeToSafeNumber } from "@/lib/serialization/bigint-json";

type PackageItemWithMaterial = MaterialPackageItem & { material: Material };
type PackageFinishedWork = Pick<FinishedWork, "id" | "workId" | "title" | "status" | "platform" | "publishTitle" | "publishUrl" | "publishedAt" | "accountName" | "projectName" | "versionName">;
type PackageWithItems = MaterialPackage & {
  items: PackageItemWithMaterial[];
  finishedWorks?: PackageFinishedWork[];
  _count?: { items: number; finishedWorks?: number };
};
type UsageWithMaterial = MaterialUsage & { material?: Material | null };

export function generateMaterialPackageId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `PKG-${day}-${randomBytes(3).toString("hex")}`;
}

export function normalizePackageStatus(value: unknown): MaterialPackageStatus | null {
  return value === "ACTIVE" || value === "ARCHIVED" || value === "DELETED" ? value : null;
}

export function toPackageListDto(pkg: PackageWithItems) {
  const itemCount = pkg._count?.items ?? pkg.items.length;
  return {
    id: pkg.id,
    packageId: pkg.packageId,
    name: pkg.name,
    purpose: pkg.purpose,
    description: pkg.description,
    notes: pkg.notes,
    status: pkg.status,
    createdByName: pkg.createdByName,
    createdAt: pkg.createdAt.toISOString(),
    updatedAt: pkg.updatedAt.toISOString(),
    itemCount,
    finishedWorkCount: pkg._count?.finishedWorks ?? pkg.finishedWorks?.length ?? 0,
    totalSize: sumPackageSize(pkg.items)
  };
}

export function toPackageDetailDto(pkg: PackageWithItems) {
  return {
    ...toPackageListDto(pkg),
    items: pkg.items
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((item) => ({
        id: item.id,
        packageId: item.packageId,
        materialId: item.materialId,
        sortOrder: item.sortOrder,
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
        material: toPackageMaterialDto(item.material)
      })),
    finishedWorks: (pkg.finishedWorks || []).map((work) => ({
      id: work.id,
      workId: work.workId,
      title: work.title,
      status: work.status,
      platform: work.platform,
      publishTitle: work.publishTitle,
      publishUrl: work.publishUrl,
      publishedAt: work.publishedAt?.toISOString() ?? null,
      accountName: work.accountName,
      projectName: work.projectName,
      versionName: work.versionName,
      isPublished: Boolean(work.publishedAt || work.publishUrl)
    }))
  };
}

export function toPackageMaterialDto(material: Material) {
  return {
    id: material.id,
    materialId: material.materialId,
    assetType: material.assetType,
    originalFileName: material.originalFileName,
    storedFileName: material.storedFileName,
    relativePath: material.relativePath,
    thumbnailPath: material.thumbnailPath,
    fileSize: byteSizeToSafeNumber(material.fileSize),
    mimeType: material.mimeType,
    duration: material.duration,
    width: material.width,
    height: material.height,
    shooterName: material.shooterName,
    uploaderName: material.uploaderName,
    primaryCategory: material.primaryCategory,
    categoryPath: material.categoryPath,
    status: material.status,
    createdAt: material.createdAt.toISOString(),
    updatedAt: material.updatedAt.toISOString()
  };
}

export function toUsageDto(
  usage: UsageWithMaterial,
  packageById?: Map<string, MaterialPackage>,
  finishedWorkById?: Map<string, FinishedWork>
) {
  const pkg = packageById?.get(usage.usageRefId);
  const work = finishedWorkById?.get(usage.usageRefId);
  return {
    id: usage.id,
    materialId: usage.materialId,
    usageType: usage.usageType,
    usageRefId: usage.usageRefId,
    usageRefLabel: usage.usageRefLabel,
    packageName: pkg?.name || usage.usageRefLabel || usage.usageRefId,
    packageStatus: pkg?.status,
    finishedWorkTitle: work?.title || usage.usageRefLabel || usage.usageRefId,
    finishedWorkStatus: work?.status,
    finishedWorkPlatform: work?.platform,
    finishedWorkPublishTitle: work?.publishTitle,
    finishedWorkPublishUrl: work?.publishUrl,
    finishedWorkPublishedAt: work?.publishedAt?.toISOString() ?? null,
    finishedWorkAccountName: work?.accountName,
    finishedWorkProjectName: work?.projectName,
    finishedWorkVersionName: work?.versionName,
    notes: usage.notes,
    createdByName: usage.createdByName,
    createdAt: usage.createdAt.toISOString()
  };
}

function sumPackageSize(items: Array<{ material: Pick<Material, "fileSize"> }>) {
  return items.reduce((total, item) => total + byteSizeToSafeNumber(item.material.fileSize), 0);
}

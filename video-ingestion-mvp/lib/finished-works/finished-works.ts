import { randomBytes } from "node:crypto";
import type {
  FinishedWork,
  FinishedWorkMaterial,
  FinishedWorkMaterialRole,
  FinishedWorkStatus,
  Material,
  MaterialPackage
} from "@prisma/client";

import { toPackageMaterialDto } from "@/lib/material-packages/material-packages";

type FinishedWorkMaterialWithMaterial = FinishedWorkMaterial & { material: Material };

export type FinishedWorkWithRelations = FinishedWork & {
  package?: MaterialPackage | null;
  materials: FinishedWorkMaterialWithMaterial[];
  _count?: { materials: number };
};

export function generateFinishedWorkId(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `FW-${day}-${randomBytes(3).toString("hex")}`;
}

export function normalizeFinishedWorkStatus(value: unknown): FinishedWorkStatus | null {
  return value === "DRAFT" ||
    value === "IN_PROGRESS" ||
    value === "DELIVERED" ||
    value === "PUBLISHED" ||
    value === "ARCHIVED"
    ? value
    : null;
}

export function normalizeFinishedWorkRole(value: unknown): FinishedWorkMaterialRole | null {
  return value === "MAIN_CLIP" || value === "B_ROLL" || value === "COVER" || value === "AUDIO" || value === "OTHER"
    ? value
    : null;
}

export function toFinishedWorkListDto(work: FinishedWorkWithRelations) {
  const materialCount = work._count?.materials ?? work.materials.length;
  return {
    id: work.id,
    workId: work.workId,
    title: work.title,
    platform: work.platform,
    purpose: work.purpose,
    status: work.status,
    packageId: work.packageId,
    packageName: work.package?.name ?? null,
    notes: work.notes,
    createdByName: work.createdByName,
    createdAt: work.createdAt.toISOString(),
    updatedAt: work.updatedAt.toISOString(),
    materialCount,
    totalSize: sumFinishedWorkSize(work.materials)
  };
}

export function toFinishedWorkDetailDto(work: FinishedWorkWithRelations) {
  return {
    ...toFinishedWorkListDto(work),
    package: work.package
      ? {
        id: work.package.id,
        packageId: work.package.packageId,
        name: work.package.name,
        status: work.package.status,
        purpose: work.package.purpose,
        description: work.package.description
      }
      : null,
    materials: work.materials
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime())
      .map((item) => ({
        id: item.id,
        workId: item.workId,
        materialId: item.materialId,
        sourcePackageId: item.sourcePackageId,
        role: item.role,
        sortOrder: item.sortOrder,
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
        material: toPackageMaterialDto(item.material)
      }))
  };
}

function sumFinishedWorkSize(items: Array<{ material: Material }>) {
  return items.reduce((total, item) => total + Number(toPackageMaterialDto(item.material).fileSize || 0), 0);
}

import { Prisma, type ShooterStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DEFAULT_SHOOTERS = ["阿阳", "家涛", "国栋"];

export function normalizeShooterName(name: string) {
  return name.trim().replace(/\s+/g, "_").slice(0, 40);
}

export async function ensureDefaultShooters() {
  const count = await prisma.shooter.count();
  if (count > 0) return;

  await prisma.shooter.createMany({
    data: DEFAULT_SHOOTERS.map((name) => ({
      name,
      displayName: name,
      status: "ACTIVE" as ShooterStatus
    }))
  });
}

export async function listShooters({ activeOnly = false } = {}) {
  await ensureDefaultShooters();
  return prisma.shooter.findMany({
    where: activeOnly ? { status: "ACTIVE" } : { NOT: { status: "DELETED" } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }]
  });
}

export async function createShooter(input: { name: string; displayName?: string; notes?: string | null }) {
  const name = normalizeShooterName(input.name || input.displayName || "");
  if (!name) throw new Error("请输入拍摄人名称。");

  return prisma.shooter.create({
    data: {
      name,
      displayName: input.displayName?.trim() || name,
      notes: input.notes?.trim() || null,
      status: "ACTIVE"
    }
  });
}

export async function updateShooter(
  id: string,
  input: {
    name?: string;
    displayName?: string;
    notes?: string | null;
    status?: ShooterStatus;
  }
) {
  const data: Prisma.ShooterUpdateInput = {};
  if (input.name !== undefined) {
    const name = normalizeShooterName(input.name);
    if (!name) throw new Error("请输入拍摄人名称。");
    data.name = name;
  }
  if (input.displayName !== undefined) data.displayName = input.displayName.trim() || input.name || "";
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.status !== undefined) data.status = input.status;

  return prisma.shooter.update({ where: { id }, data });
}

export async function softDeleteShooter(id: string) {
  return prisma.shooter.update({
    where: { id },
    data: { status: "DELETED" }
  });
}

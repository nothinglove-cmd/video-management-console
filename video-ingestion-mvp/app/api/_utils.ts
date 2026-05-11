import { NextResponse } from "next/server";
import type { Material } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function findMaterial(id: string): Promise<Material | null> {
  return prisma.material.findFirst({
    where: {
      OR: [{ id }, { materialId: id }]
    }
  });
}

export async function requireMaterial(id: string) {
  const material = await findMaterial(id);
  if (!material) throw new Error("素材不存在。");
  return material;
}

export async function getRouteId(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(context.params);
  return params.id;
}

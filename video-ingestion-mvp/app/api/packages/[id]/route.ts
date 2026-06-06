import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { normalizePackageStatus, toPackageDetailDto } from "@/lib/material-packages/material-packages";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdatePackageBody = {
  name?: string;
  purpose?: string | null;
  description?: string | null;
  notes?: string | null;
  status?: string;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const pkg = await findPackage(id);
  if (!pkg) return jsonError("精选包不存在。", 404);
  return NextResponse.json({ package: toPackageDetailDto(pkg) });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const existing = await findPackage(id);
  if (!existing) return jsonError("精选包不存在。", 404);

  const body = await readJson<UpdatePackageBody>(request);
  const status = body.status === undefined ? undefined : normalizePackageStatus(body.status);
  if (body.status !== undefined && !status) return jsonError("精选包状态无效。");

  const data: Prisma.MaterialPackageUpdateInput = {};
  const nextName = body.name === undefined ? undefined : cleanRequiredText(body.name, 80);
  if (body.name !== undefined && !nextName) return jsonError("请填写精选包名称。");
  if (nextName) data.name = nextName;
  if (body.purpose !== undefined) data.purpose = cleanNullableText(body.purpose, 120);
  if (body.description !== undefined) data.description = cleanNullableText(body.description, 500);
  if (body.notes !== undefined) data.notes = cleanNullableText(body.notes, 1000);
  if (status) data.status = status;

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.materialPackage.update({
      where: { packageId: existing.packageId },
      data,
      include: {
        items: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" }
          ],
          include: { material: true }
        },
        finishedWorks: {
          orderBy: { updatedAt: "desc" }
        },
        _count: { select: { items: true, finishedWorks: true } }
      }
    });

    if (nextName && nextName !== existing.name) {
      await tx.materialUsage.updateMany({
        where: {
          usageType: "PACKAGE",
          usageRefId: existing.packageId
        },
        data: { usageRefLabel: nextName }
      });
    }

    return next;
  });

  return NextResponse.json({ package: toPackageDetailDto(updated) });
}

async function findPackage(id: string) {
  return prisma.materialPackage.findFirst({
    where: {
      OR: [
        { id },
        { packageId: id }
      ],
      NOT: { status: "DELETED" }
    },
      include: {
        items: {
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" }
          ],
          include: { material: true }
        },
      finishedWorks: {
        orderBy: { updatedAt: "desc" }
      },
      _count: { select: { items: true, finishedWorks: true } }
    }
  });
}

function cleanRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanNullableText(value: unknown, maxLength: number) {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

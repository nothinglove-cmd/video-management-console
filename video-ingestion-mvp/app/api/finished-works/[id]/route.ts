import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { getRouteId, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import {
  normalizeFinishedWorkStatus,
  toFinishedWorkDetailDto
} from "@/lib/finished-works/finished-works";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateFinishedWorkBody = {
  title?: string;
  platform?: string | null;
  purpose?: string | null;
  status?: string;
  packageId?: string | null;
  notes?: string | null;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const work = await findFinishedWork(id);
  if (!work) return jsonError("成片/交付记录不存在。", 404);
  return NextResponse.json({ finishedWork: toFinishedWorkDetailDto(work) });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const existing = await findFinishedWork(id);
  if (!existing) return jsonError("成片/交付记录不存在。", 404);

  const body = await readJson<UpdateFinishedWorkBody>(request);
  const status = body.status === undefined ? undefined : normalizeFinishedWorkStatus(body.status);
  if (body.status !== undefined && !status) return jsonError("成片状态无效。");

  const data: Prisma.FinishedWorkUpdateInput = {};
  const nextTitle = body.title === undefined ? undefined : cleanRequiredText(body.title, 120);
  if (body.title !== undefined && !nextTitle) return jsonError("请填写成片/交付件标题。");
  if (nextTitle) data.title = nextTitle;
  if (body.platform !== undefined) data.platform = cleanNullableText(body.platform, 80);
  if (body.purpose !== undefined) data.purpose = cleanNullableText(body.purpose, 160);
  if (body.notes !== undefined) data.notes = cleanNullableText(body.notes, 1000);
  if (status) data.status = status;
  if (body.packageId !== undefined) {
    if (body.packageId === null || body.packageId === "") {
      data.package = { disconnect: true };
    } else {
      const pkg = await findPackage(body.packageId);
      if (!pkg) return jsonError("关联精选包不存在。", 404);
      data.package = { connect: { packageId: pkg.packageId } };
      data.workspace = pkg.workspaceId ? { connect: { id: pkg.workspaceId } } : undefined;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.finishedWork.update({
      where: { workId: existing.workId },
      data,
      include: detailInclude
    });

    if (nextTitle && nextTitle !== existing.title) {
      await tx.materialUsage.updateMany({
        where: {
          usageType: "FINISHED_WORK",
          usageRefId: existing.workId
        },
        data: { usageRefLabel: nextTitle }
      });
    }

    return next;
  });

  return NextResponse.json({ finishedWork: toFinishedWorkDetailDto(updated) });
}

async function findFinishedWork(id: string) {
  return prisma.finishedWork.findFirst({
    where: {
      OR: [
        { id },
        { workId: id }
      ]
    },
    include: detailInclude
  });
}

async function findPackage(id: string) {
  return prisma.materialPackage.findFirst({
    where: {
      OR: [
        { id },
        { packageId: id }
      ],
      NOT: { status: "DELETED" }
    }
  });
}

const detailInclude = {
  package: true,
  materials: {
    orderBy: [
      { sortOrder: "asc" as const },
      { createdAt: "asc" as const }
    ],
    include: { material: true }
  },
  _count: { select: { materials: true } }
};

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

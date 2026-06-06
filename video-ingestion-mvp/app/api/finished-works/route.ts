import { NextResponse } from "next/server";

import { authOperatorName, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import {
  generateFinishedWorkId,
  normalizeFinishedWorkStatus,
  toFinishedWorkListDto
} from "@/lib/finished-works/finished-works";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateFinishedWorkBody = {
  title?: string;
  platform?: string | null;
  purpose?: string | null;
  status?: string;
  packageId?: string | null;
  notes?: string | null;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const rawStatus = url.searchParams.get("status");
  const status = rawStatus === "ALL" ? null : normalizeFinishedWorkStatus(rawStatus);
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);

  const works = await prisma.finishedWork.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? {
        OR: [
          { workId: { contains: q } },
          { title: { contains: q } },
          { platform: { contains: q } },
          { purpose: { contains: q } },
          { notes: { contains: q } }
        ]
      } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      package: true,
      materials: {
        include: { material: true }
      },
      _count: {
        select: { materials: true }
      }
    }
  });

  return NextResponse.json({ finishedWorks: works.map(toFinishedWorkListDto) });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const body = await readJson<CreateFinishedWorkBody>(request);
  const title = cleanText(body.title, 120);
  if (!title) return jsonError("请填写成片/交付件标题。");

  const status = body.status === undefined ? "DRAFT" : normalizeFinishedWorkStatus(body.status);
  if (!status) return jsonError("成片状态无效。");
  const pkg = body.packageId ? await findPackage(body.packageId) : null;
  if (body.packageId && !pkg) return jsonError("关联精选包不存在。", 404);

  const data = {
    workspaceId: pkg?.workspaceId ?? undefined,
    title,
    platform: cleanNullableText(body.platform, 80),
    purpose: cleanNullableText(body.purpose, 160),
    status,
    packageId: pkg?.packageId,
    notes: cleanNullableText(body.notes, 1000),
    createdByName: authOperatorName(auth.user)
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.finishedWork.create({
        data: {
          ...data,
          workId: generateFinishedWorkId()
        },
        include: {
          package: true,
          materials: { include: { material: true } },
          _count: { select: { materials: true } }
        }
      });
      return NextResponse.json({ finishedWork: toFinishedWorkListDto(created) }, { status: 201 });
    } catch (error) {
      if (!isUniqueWorkIdError(error) || attempt === 4) throw error;
    }
  }

  return jsonError("成片编号生成失败。", 500);
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

function cleanText(value: unknown, maxLength: number) {
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

function isUniqueWorkIdError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "P2002";
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

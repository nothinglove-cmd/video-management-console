import { NextResponse } from "next/server";

import { authOperatorName, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { generateMaterialPackageId, normalizePackageStatus, toPackageListDto } from "@/lib/material-packages/material-packages";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreatePackageBody = {
  name?: string;
  purpose?: string;
  description?: string;
  notes?: string;
};

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const rawStatus = url.searchParams.get("status");
  const status = rawStatus === "ALL" ? null : normalizePackageStatus(rawStatus);
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 100);

  const packages = await prisma.materialPackage.findMany({
    where: {
      ...(status ? { status } : { NOT: { status: "DELETED" } }),
      ...(q ? {
        OR: [
          { packageId: { contains: q } },
          { name: { contains: q } },
          { purpose: { contains: q } },
          { notes: { contains: q } }
        ]
      } : {})
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      items: {
        include: { material: true }
      },
      _count: {
        select: { items: true }
      }
    }
  });

  return NextResponse.json({ packages: packages.map(toPackageListDto) });
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const body = await readJson<CreatePackageBody>(request);
  const name = cleanText(body.name, 80);
  if (!name) return jsonError("请填写精选包名称。");

  const data = {
    name,
    purpose: cleanText(body.purpose, 120),
    description: cleanText(body.description, 500),
    notes: cleanText(body.notes, 1000),
    createdByName: authOperatorName(auth.user)
  };

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.materialPackage.create({
        data: {
          ...data,
          packageId: generateMaterialPackageId()
        },
        include: {
          items: { include: { material: true } },
          _count: { select: { items: true } }
        }
      });
      return NextResponse.json({ package: toPackageListDto(created) }, { status: 201 });
    } catch (error) {
      if (!isUniquePackageIdError(error) || attempt === 4) throw error;
    }
  }

  return jsonError("精选包编号生成失败。", 500);
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isUniquePackageIdError(error: unknown) {
  return error && typeof error === "object" && "code" in error && error.code === "P2002";
}

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";
import type { CategoryStatus } from "@prisma/client";

import { softDeleteCategory, updateCategory } from "@/lib/categories/category.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const category = await updateCategory(id, {
    name: body.name,
    assetType: body.assetType,
    parentId: body.parentId,
    relativePath: body.relativePath,
    physicalDirectory: body.physicalDirectory,
    sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    allowUpload: body.allowUpload,
    status: body.status as CategoryStatus | undefined,
    notes: body.notes
  });
  return NextResponse.json({ category });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const category = await softDeleteCategory(id);
  return NextResponse.json({ category });
}

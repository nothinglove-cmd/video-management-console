import { NextResponse } from "next/server";
import type { AssetType } from "@prisma/client";

import { getRouteId, jsonError, readJson, requireMaterial } from "@/app/api/_utils";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";

const ASSET_TYPES = ["ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE", "UNKNOWN"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{
    categoryId?: string;
    assetType?: AssetType;
    category?: string;
    operatorName?: string;
    notes?: string;
  }>(request);
  const material = await requireMaterial(id);

  if (body.categoryId) {
    const category = await prisma.category.findUnique({
      where: { id: body.categoryId },
      include: {
        children: {
          where: { NOT: { status: "DELETED" } },
          select: { id: true }
        }
      }
    });
    if (!category) return jsonError("目标栏目不存在，请刷新后重试。");
    if (category.status !== "ACTIVE") return jsonError(`栏目「${category.name}」不是启用状态，不能移动。`);
    if (!category.allowUpload) return jsonError(`栏目「${category.name}」不允许上传或移动素材。`);
    if (!category.relativePath) return jsonError(`栏目「${category.name}」没有绑定真实目录。`);
    if (category.children.length > 0) return jsonError(`请选择「${category.name}」下的具体子栏目。`);

    const updated = await storageService.moveMaterial({
      material,
      targetAssetType: category.assetType,
      targetCategory: category.relativePath,
      targetCategoryRecord: category,
      operatorName: body.operatorName,
      notes: body.notes
    });
    return NextResponse.json({ material: updated });
  }

  if (!body.assetType || !ASSET_TYPES.includes(body.assetType)) return jsonError("请选择有效素材类型。");
  if (!body.category) return jsonError("请选择目标分类。");
  const updated = await storageService.moveMaterial({
    material,
    targetAssetType: body.assetType,
    targetCategory: body.category,
    operatorName: body.operatorName,
    notes: body.notes
  });
  return NextResponse.json({ material: updated });
}

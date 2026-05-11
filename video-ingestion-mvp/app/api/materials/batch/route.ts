import { NextResponse } from "next/server";
import type { AssetType } from "@prisma/client";

import { jsonError, readJson } from "@/app/api/_utils";
import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchBody = {
  action?: "confirm" | "move" | "trash" | "reanalyze";
  ids?: string[];
  targetAssetType?: AssetType;
  targetCategory?: string;
  operatorName?: string;
};

export async function POST(request: Request) {
  const body = await readJson<BatchBody>(request);
  const ids = body.ids ?? [];
  if (!body.action || ids.length === 0) return jsonError("请选择批量操作和素材。");
  const operatorName = normalizeOperatorName(body.operatorName);

  const materials = await prisma.material.findMany({
    where: { OR: [{ id: { in: ids } }, { materialId: { in: ids } }] }
  });

  const results = [];
  for (const material of materials) {
    if (body.action === "confirm") {
      results.push(await storageService.confirmMaterial({ material, operatorName }));
    }

    if (body.action === "move") {
      if (!body.targetAssetType || !body.targetCategory) return jsonError("批量移动需要目标类型和分类。");
      results.push(
        await storageService.moveMaterial({
          material,
          targetAssetType: body.targetAssetType,
          targetCategory: body.targetCategory,
          operatorName,
          notes: "批量移动分类"
        })
      );
    }

    if (body.action === "trash") {
      results.push(
        await storageService.deleteToTrash({
          material,
          operatorName,
          notes: "批量删除到回收站"
        })
      );
    }

    if (body.action === "reanalyze") {
      results.push(await ingestionPipeline.reanalyzeMaterial(material));
    }
  }

  return NextResponse.json({ results });
}

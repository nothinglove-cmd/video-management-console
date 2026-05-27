import { NextResponse } from "next/server";
import type { AssetType } from "@prisma/client";

import { authOperatorName, jsonError, readJson, requireAdmin } from "@/app/api/_utils";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BatchBody = {
  action?: "confirm" | "move" | "trash" | "reanalyze";
  ids?: string[];
  targetAssetType?: AssetType;
  targetCategory?: string;
};

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const body = await readJson<BatchBody>(request);
  const ids = body.ids ?? [];
  if (!body.action || ids.length === 0) return jsonError("请选择批量操作和素材。");
  const operatorName = authOperatorName(auth.user);

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

  return NextResponse.json(toJsonSafe({ results }));
}

import { NextResponse } from "next/server";

import { getRouteId, jsonError, readJson, requireMaterial } from "@/app/api/_utils";
import { normalizeOperatorName } from "@/lib/operator/operator-context";
import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionPipeline } from "@/modules/ingestion/ingestion.pipeline";

export const runtime = "nodejs";

const ACTIONS = ["USE_USER_SELECTION", "USE_AI_SUGGESTION", "MANUAL_DIRECTORY"] as const;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = await getRouteId(context);
  const body = await readJson<{
    action?: (typeof ACTIONS)[number];
    categoryId?: string;
    rootCategory?: string;
    subCategory?: string;
    operatorName?: string;
  }>(request);
  if (!body.action || !ACTIONS.includes(body.action)) return jsonError("请选择有效的冲突处理方式。");
  const material = await requireMaterial(id);
  const category = body.action === "MANUAL_DIRECTORY" && body.categoryId
    ? await prisma.category.findUnique({
        where: { id: body.categoryId },
        include: {
          children: {
            where: { NOT: { status: "DELETED" } },
            select: { id: true }
          }
        }
      })
    : null;
  if (body.action === "MANUAL_DIRECTORY" && body.categoryId) {
    if (!category) return jsonError("目标栏目不存在，请刷新后重试。");
    if (category.status !== "ACTIVE") return jsonError(`栏目「${category.name}」不是启用状态，不能用于解决冲突。`);
    if (!category.allowUpload) return jsonError(`栏目「${category.name}」不允许上传或移动素材。`);
    if (!category.relativePath) return jsonError(`栏目「${category.name}」没有绑定真实目录。`);
    if (category.children.length > 0) return jsonError(`请选择「${category.name}」下的具体子栏目。`);
  }
  const updated = await ingestionPipeline.resolveConflict({
    material,
    action: body.action,
    category,
    rootCategory: body.rootCategory,
    subCategory: body.subCategory,
    operatorName: normalizeOperatorName(body.operatorName)
  });
  return NextResponse.json(toJsonSafe({ material: updated }));
}

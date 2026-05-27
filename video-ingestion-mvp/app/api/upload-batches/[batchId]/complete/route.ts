import { NextResponse } from "next/server";

import { canUseUploadSourceType, requireApiUser, uploadSourceDeniedResponse } from "@/app/api/_utils";

import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const { batchId } = await context.params;
  const batch = await prisma.importBatch.findUnique({ where: { batchId } });
  if (!batch) {
    return NextResponse.json({ error: "批次不存在。" }, { status: 404 });
  }
  if (batch.status !== "UPLOADING") {
    return NextResponse.json({ error: "批次已结束接收，请刷新批次状态。" }, { status: 409 });
  }
  if (!canUseUploadSourceType(auth.user, batch.sourceType)) return uploadSourceDeniedResponse();

  const receivedCount = await prisma.ingestionJob.count({ where: { batchId } });
  const updatedBatch = await prisma.importBatch.update({
    where: { batchId },
    data: {
      status: receivedCount > 0 ? "PROCESSING" : "FAILED"
    }
  });

  if (receivedCount > 0) ingestionQueueService.kick();

  return NextResponse.json(toJsonSafe({
    batchId,
    batch: updatedBatch,
    acceptedCount: receivedCount,
    importedCount: 0,
    failedCount: Math.max(0, batch.fileCount - receivedCount),
    message: receivedCount > 0
      ? "批次上传已完成，后台正在继续入库。"
      : "批次未接收到文件。"
  }));
}

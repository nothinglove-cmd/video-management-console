import { NextResponse } from "next/server";

import { requireAdmin } from "@/app/api/_utils";

import { prisma } from "@/lib/prisma";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requireAdmin(request);
  if ("response" in auth) return auth.response;

  const { batchId } = await context.params;
  const body = await request.json().catch(() => ({})) as { jobIds?: unknown };
  const jobIds = Array.isArray(body.jobIds)
    ? body.jobIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;

  const batch = await prisma.importBatch.findUnique({ where: { batchId } });
  if (!batch) {
    return NextResponse.json({ error: "批次不存在。" }, { status: 404 });
  }

  const result = await ingestionQueueService.retryFailedJobs(batchId, jobIds);
  return NextResponse.json({
    batchId,
    ...result,
    message: retryMessage(result.retriedCount, result.skippedMissingSourceCount)
  });
}

function retryMessage(retriedCount: number, skippedMissingSourceCount: number) {
  if (retriedCount > 0 && skippedMissingSourceCount > 0) {
    return `已重新加入队列：${retriedCount} 个失败任务；${skippedMissingSourceCount} 个任务源文件不存在，未重试。`;
  }
  if (retriedCount > 0) return `已重新加入队列：${retriedCount} 个失败任务。`;
  if (skippedMissingSourceCount > 0) return "没有可重试的源文件；缺失源文件的任务已保留失败状态。";
  return "没有可重试的失败任务。";
}

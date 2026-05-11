import { NextResponse } from "next/server";
import type { ImportBatch, IngestionJob, Material } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildBatchSummary(batch: ImportBatch, jobs: IngestionJob[], materials: Material[]) {
  const queued = jobs.filter((job) => job.status === "QUEUED").length;
  const running = jobs.filter((job) => job.status === "RUNNING").length;
  const succeeded = jobs.length
    ? jobs.filter((job) => job.status === "SUCCEEDED").length
    : materials.filter((material) => ["READY", "IMPORTED"].includes(material.status)).length;
  const failedJobs = jobs.filter((job) => job.status === "FAILED").length;
  const retryableJobs = jobs.filter((job) => job.status === "FAILED" && !job.materialId).length;
  const failedMaterials = materials.filter((material) => material.status === "FAILED").length;
  const failed = jobs.length ? failedJobs : failedMaterials;
  const needsReview = materials.filter((material) => material.status === "NEEDS_REVIEW").length;
  const received = Math.max(jobs.length, materials.length);

  return {
    total: batch.fileCount,
    queued,
    running,
    succeeded,
    failed,
    needsReview,
    retryable: retryableJobs,
    received,
    displayStatus: batch.status,
    statusText: batchStatusText(batch.status, { queued, running, succeeded, failed, needsReview, received, total: batch.fileCount })
  };
}

function batchStatusText(
  status: ImportBatch["status"],
  counts: { queued: number; running: number; succeeded: number; failed: number; needsReview: number; received: number; total: number }
) {
  if (counts.running > 0) return `后台入库中：${counts.running} 个处理中`;
  if (counts.queued > 0) return `等待后台入库：${counts.queued} 个排队中`;
  if (status === "FAILED") return "批次处理失败";
  if (status === "PARTIAL_FAILED") return `部分失败：${counts.failed} 个失败`;
  if (status === "NEEDS_REVIEW") return `需要人工确认：${counts.needsReview} 个待确认`;
  if (status === "IMPORTED") return "批次已完成入库";
  if (status === "UPLOADING") return `文件接收中：已接收 ${counts.received}/${counts.total}`;
  return "后台入库处理中";
}

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  ingestionQueueService.kick();

  const batch = await prisma.importBatch.findUnique({ where: { batchId } });
  if (!batch) {
    return NextResponse.json({ error: "批次不存在。" }, { status: 404 });
  }

  const [jobs, materials] = await Promise.all([
    prisma.ingestionJob.findMany({
      where: { batchId },
      orderBy: { createdAt: "asc" }
    }),
    prisma.material.findMany({
      where: { batchId },
      orderBy: { createdAt: "desc" },
      include: {
        operationLogs: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    })
  ]);

  return NextResponse.json({
    batch,
    summary: buildBatchSummary(batch, jobs, materials),
    jobs: jobs.map((job) => ({
      jobId: job.id,
      originalFileName: job.originalFileName,
      fileSize: job.fileSize,
      sourceType: job.sourceType,
      incomingRelativePath: job.incomingRelativePath,
      status: job.status,
      materialId: job.materialId,
      attempts: job.attempts,
      lastError: job.lastError,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt
    })),
    materials
  });
}

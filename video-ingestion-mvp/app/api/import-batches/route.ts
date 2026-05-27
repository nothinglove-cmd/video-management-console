import { NextResponse } from "next/server";

import { isAdminUser, requireApiUser } from "@/app/api/_utils";
import type { ImportBatch, IngestionJob, Material, SourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toJsonSafe } from "@/lib/serialization/bigint-json";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEB_UPLOAD_SOURCE_TYPES: SourceType[] = ["WEB_MOBILE_UPLOAD", "WEB_DESKTOP_UPLOAD"];

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  ingestionQueueService.kick();

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") || "10");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 50) : 10;
  const batchWhere = isAdminUser(auth.user)
    ? {}
    : { sourceType: { in: WEB_UPLOAD_SOURCE_TYPES } };

  const batches = await prisma.importBatch.findMany({
    where: batchWhere,
    orderBy: { createdAt: "desc" },
    take: limit
  });
  const batchIds = batches.map((batch) => batch.batchId);
  const [jobs, materials] = await Promise.all([
    prisma.ingestionJob.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.material.findMany({
      where: { batchId: { in: batchIds } },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return NextResponse.json(toJsonSafe({
    batches: batches.map((batch) => {
      const batchJobs = jobs.filter((job) => job.batchId === batch.batchId);
      const batchMaterials = materials.filter((material) => material.batchId === batch.batchId);
      return {
        batch,
        summary: buildBatchSummary(batch, batchJobs, batchMaterials)
      };
    })
  }));
}

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

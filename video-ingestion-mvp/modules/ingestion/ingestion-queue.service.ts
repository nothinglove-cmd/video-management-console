import fs from "node:fs/promises";
import type { IngestionJob, IngestionJobStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";
import { ingestionPipeline, type ManualAssetType } from "@/modules/ingestion/ingestion.pipeline";

const ACTIVE_STATUSES: IngestionJobStatus[] = ["QUEUED", "RUNNING"];
const MISSING_SOURCE_ERROR = "源文件不存在，可能已被失败处理移动到失败目录，请人工检查后重新导入。";
const STALE_RUNNING_JOB_MS = 30 * 60 * 1000;

class IngestionQueueService {
  private running = false;
  private scheduled = false;

  kick() {
    if (this.scheduled) return;
    this.scheduled = true;
    setTimeout(() => {
      this.scheduled = false;
      this.processPending().catch((error) => {
        console.error("[ingestion-queue] worker failed", error);
      });
    }, 20);
  }

  async processPending() {
    if (this.running) return;
    this.running = true;

    try {
      await storageService.initializeStorage();
      await this.requeueStaleRunningJobs();

      while (true) {
        const job = await prisma.ingestionJob.findFirst({
          where: {
            status: "QUEUED",
            materialId: null
          },
          orderBy: { createdAt: "asc" }
        });
        if (!job) break;

        const claimed = await prisma.ingestionJob.updateMany({
          where: { id: job.id, status: "QUEUED" },
          data: {
            status: "RUNNING",
            attempts: { increment: 1 },
            startedAt: new Date(),
            lockedAt: new Date()
          }
        });
        if (claimed.count === 0) continue;

        const activeJob = await prisma.ingestionJob.findUnique({ where: { id: job.id } });
        if (activeJob) await this.processJob(activeJob);
      }
    } finally {
      this.running = false;
    }
  }

  async hasActiveJobs(batchId?: string) {
    const count = await prisma.ingestionJob.count({
      where: {
        ...(batchId ? { batchId } : {}),
        status: { in: ACTIVE_STATUSES }
      }
    });
    return count > 0;
  }

  async retryFailedJobs(batchId: string, jobIds?: string[]) {
    const failedJobs = await prisma.ingestionJob.findMany({
      where: {
        batchId,
        status: "FAILED",
        materialId: null,
        ...(jobIds?.length ? { id: { in: jobIds } } : {})
      }
    });
    const retryableJobs: IngestionJob[] = [];
    const skippedJobs: Array<{ jobId: string; originalFileName: string; incomingRelativePath: string }> = [];

    for (const job of failedJobs) {
      const sourcePath = storageService.resolve(job.incomingRelativePath);
      if (await fileExists(sourcePath)) {
        retryableJobs.push(job);
      } else {
        skippedJobs.push({
          jobId: job.id,
          originalFileName: job.originalFileName,
          incomingRelativePath: job.incomingRelativePath
        });
      }
    }

    if (skippedJobs.length > 0) {
      await prisma.ingestionJob.updateMany({
        where: { id: { in: skippedJobs.map((job) => job.jobId) } },
        data: { lastError: MISSING_SOURCE_ERROR }
      });
    }

    const result = retryableJobs.length > 0
      ? await prisma.ingestionJob.updateMany({
          where: { id: { in: retryableJobs.map((job) => job.id) } },
          data: {
            status: "QUEUED",
            lockedAt: null,
            completedAt: null
          }
        })
      : { count: 0 };

    if (result.count > 0) {
      await prisma.importBatch.update({
        where: { batchId },
        data: { status: "PROCESSING" }
      });
      this.kick();
    }

    return {
      retriedCount: result.count,
      skippedMissingSourceCount: skippedJobs.length,
      skippedJobs
    };
  }

  private async processJob(job: IngestionJob) {
    if (job.status !== "RUNNING") return;
    if (job.materialId) {
      await prisma.ingestionJob.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: {
          status: "SUCCEEDED",
          completedAt: new Date(),
          lockedAt: null,
          lastError: null
        }
      });
      await ingestionPipeline.finalizeBatch(job.batchId);
      return;
    }

    try {
      const incomingAbsolutePath = storageService.resolve(job.incomingRelativePath);
      if (!(await fileExists(incomingAbsolutePath))) {
        await prisma.ingestionJob.updateMany({
          where: { id: job.id, status: "RUNNING", materialId: null },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            lockedAt: null,
            lastError: MISSING_SOURCE_ERROR
          }
        });
        await ingestionPipeline.finalizeBatch(job.batchId);
        return;
      }

      const material = await ingestionPipeline.ingestFile({
        batchId: job.batchId,
        sourceType: job.sourceType,
        incomingAbsolutePath,
        originalFileName: job.originalFileName,
        fileSize: job.fileSize,
        mimeType: job.mimeType,
        uploaderName: job.uploaderName,
        shooterId: job.shooterId,
        shooterName: job.shooterName,
        categoryId: job.categoryId,
        userSelectedCategoryId: job.userSelectedCategoryId,
        rootCategory: job.rootCategory,
        subCategory: job.subCategory,
        customTags: toStringArray(job.customTags),
        notes: job.notes,
        manualAssetType: toManualAssetType(job.manualAssetType)
      });

      await prisma.ingestionJob.updateMany({
        where: { id: job.id, status: "RUNNING", materialId: null },
        data: {
          status: "SUCCEEDED",
          materialId: material.materialId,
          completedAt: new Date(),
          lockedAt: null
        }
      });
      await ingestionPipeline.finalizeBatch(job.batchId);
    } catch (error) {
      await prisma.ingestionJob.updateMany({
        where: { id: job.id, status: "RUNNING", materialId: null },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          lockedAt: null,
          lastError: (error as Error).message || "后台入库失败"
        }
      });
      await ingestionPipeline.finalizeBatch(job.batchId);
    }
  }

  private async requeueStaleRunningJobs() {
    const staleBefore = new Date(Date.now() - STALE_RUNNING_JOB_MS);
    await prisma.ingestionJob.updateMany({
      where: {
        status: "RUNNING",
        materialId: null,
        OR: [
          { lockedAt: { lt: staleBefore } },
          { lockedAt: null, startedAt: { lt: staleBefore } }
        ]
      },
      data: {
        status: "QUEUED",
        lockedAt: null,
        lastError: "后台任务恢复检查：已重新加入队列。"
      }
    });
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function toManualAssetType(value?: string | null): ManualAssetType {
  return value === "ACCOUNT_MATERIAL" ||
    value === "PRODUCT_MATERIAL" ||
    value === "REFERENCE_VIDEO" ||
    value === "PUBLIC_RESOURCE"
    ? value
    : "AUTO";
}

export const ingestionQueueService = new IngestionQueueService();

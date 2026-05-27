import fs from "node:fs/promises";
import { NextResponse } from "next/server";

import { canUseUploadSourceType, requireApiUser, uploadSourceDeniedResponse } from "@/app/api/_utils";
import type { SourceType } from "@prisma/client";

import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { byteSizeToBigInt, byteSizeToSafeNumber, toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";
import { type ManualAssetType } from "@/modules/ingestion/ingestion.pipeline";
import { ingestionQueueService } from "@/modules/ingestion/ingestion-queue.service";
import { normalizeCustomTags } from "@/modules/ingestion/ingest-taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_UPLOAD_OVERHEAD_LIMIT_BYTES = 16 * 1024 * 1024;

function isSourceType(value: FormDataEntryValue | null): value is SourceType {
  return (
    typeof value === "string" &&
    ["WEB_MOBILE_UPLOAD", "WEB_DESKTOP_UPLOAD", "DEVICE_IMPORT", "MANUAL_IMPORT"].includes(value)
  );
}

function isManualAssetType(value: FormDataEntryValue | null): value is ManualAssetType {
  return (
    typeof value === "string" &&
    ["AUTO", "ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE"].includes(value)
  );
}

export async function POST(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const contentLength = readContentLength(request);
  if (contentLength > MAX_UPLOAD_BYTES + LEGACY_UPLOAD_OVERHEAD_LIMIT_BYTES) {
    return NextResponse.json({
      error: "旧版批量上传接口单次请求超过 1GB 上限。请使用页面逐文件上传；10GB+/50GB+ 原片请使用本地/NAS/设备目录导入。"
    }, { status: 413 });
  }

  await storageService.initializeStorage();
  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const requestedSourceType = form.get("sourceType");
  const sourceType: SourceType = isSourceType(requestedSourceType)
    ? requestedSourceType
    : "WEB_DESKTOP_UPLOAD";
  if (!canUseUploadSourceType(auth.user, sourceType)) return uploadSourceDeniedResponse();
  const uploaderName = String(form.get("uploaderName") || "").trim() || "阿阳";
  const shooterId = String(form.get("shooterId") || "").trim();
  const shooterName = String(form.get("shooterName") || "").trim() || uploaderName;
  const categoryId = String(form.get("categoryId") || "").trim();
  const rootCategory = String(form.get("rootCategory") || "AUTO").trim();
  const subCategory = String(form.get("subCategory") || "AUTO").trim();
  const customTags = normalizeCustomTags(form.get("customTags"));
  const notes = String(form.get("notes") || "").trim();
  const requestedManualAssetType = form.get("manualAssetType");
  const manualAssetType: ManualAssetType = isManualAssetType(requestedManualAssetType)
    ? requestedManualAssetType
    : "AUTO";

  if (files.length === 0) {
    return NextResponse.json({ error: "请选择至少一个视频或图片文件。" }, { status: 400 });
  }

  const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
  if (oversized) {
    return NextResponse.json({ error: `${oversized.name} 超过单文件 1GB 的本地测试限制。` }, { status: 413 });
  }

  const selectedCategory = categoryId
    ? await prisma.category.findUnique({
        where: { id: categoryId },
        include: { _count: { select: { children: true } } }
      })
    : null;
  if (categoryId && !selectedCategory) {
    return NextResponse.json({ error: "选择的栏目不存在，请刷新后重新选择。" }, { status: 400 });
  }
  if (selectedCategory && selectedCategory.status !== "ACTIVE") {
    return NextResponse.json({ error: `栏目「${selectedCategory.name}」已停用，不能上传。` }, { status: 400 });
  }
  if (selectedCategory && !selectedCategory.allowUpload) {
    return NextResponse.json({ error: `栏目「${selectedCategory.name}」不允许上传。` }, { status: 400 });
  }
  if (selectedCategory && selectedCategory._count.children > 0) {
    return NextResponse.json({ error: `请选择「${selectedCategory.name}」下的具体子栏目。` }, { status: 400 });
  }
  if (selectedCategory && !selectedCategory.relativePath) {
    return NextResponse.json({ error: `栏目「${selectedCategory.name}」没有绑定真实目录。` }, { status: 400 });
  }

  const batchId = await storageService.createBatchId(sourceType);
  const workspaceContext = await getDefaultWorkspaceContext();
  await prisma.importBatch.create({
    data: {
      workspaceId: workspaceContext.workspaceId,
      batchId,
      sourceType,
      uploaderName,
      fileCount: files.length,
      totalSize: byteSizeToBigInt(files.reduce((sum, file) => sum + file.size, 0)),
      status: "PROCESSING",
      notes
    }
  });

  const jobs = [];
  const errors = [];

  for (const file of files) {
    try {
      const destination = await storageService.createIncomingPath(sourceType, file.name);
      await fs.writeFile(destination.absolutePath, Buffer.from(await file.arrayBuffer()));
      const incomingRelativePath = storageService.toRelative(destination.absolutePath);
      const job = await prisma.ingestionJob.create({
        data: {
          workspaceId: workspaceContext.workspaceId,
          batchId,
          sourceType,
          incomingRelativePath,
          originalFileName: file.name,
          fileSize: byteSizeToBigInt(file.size),
          mimeType: file.type || null,
          uploaderName,
          shooterId,
          shooterName,
          categoryId: selectedCategory?.id || null,
          userSelectedCategoryId: selectedCategory?.id || null,
          rootCategory,
          subCategory,
          customTags,
          notes,
          manualAssetType,
          status: "QUEUED"
        }
      });
      jobs.push({
        jobId: job.id,
        originalFileName: job.originalFileName,
        fileSize: byteSizeToSafeNumber(job.fileSize),
        sourceType: job.sourceType,
        incomingRelativePath: job.incomingRelativePath,
        status: job.status,
        createdAt: job.createdAt
      });
    } catch (error) {
      errors.push({ fileName: file.name, error: (error as Error).message });
    }
  }

  if (jobs.length > 0) {
    ingestionQueueService.kick();
  } else {
    await prisma.importBatch.update({
      where: { batchId },
      data: { status: "FAILED" }
    });
  }

  return NextResponse.json(toJsonSafe({
    batchId,
    message: "文件已上传，后台正在 AI 入库。",
    acceptedCount: jobs.length,
    importedCount: jobs.length,
    failedCount: errors.length,
    jobs,
    materials: [],
    errors
  }));
}

function readContentLength(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
}

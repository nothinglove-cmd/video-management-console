import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";

import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { byteSizeToBigInt, toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

import { metadataFromForm, serializeUploadJob, validateUploadCategory, validateUploadFile } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MULTIPART_OVERHEAD_LIMIT_BYTES = 16 * 1024 * 1024;

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  await storageService.initializeStorage();
  const { batchId } = await context.params;
  const batch = await prisma.importBatch.findUnique({ where: { batchId } });
  if (!batch) {
    return NextResponse.json({ error: "批次不存在。" }, { status: 404 });
  }
  if (batch.status !== "UPLOADING") {
    return NextResponse.json({ error: "批次已结束接收，不能继续上传文件。" }, { status: 409 });
  }

  const contentLength = readContentLength(request);
  if (contentLength > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_LIMIT_BYTES) {
    return NextResponse.json({
      error: "浏览器单文件上传超过 1GB 上限。10GB+/50GB+ 原片请使用本地/NAS/设备目录导入。"
    }, { status: 413 });
  }

  const form = await request.formData();
  const fileResult = validateUploadFile(form.get("file") instanceof File ? form.get("file") as File : null);
  if ("error" in fileResult) {
    return NextResponse.json({ error: fileResult.error }, { status: fileResult.status });
  }

  const metadata = metadataFromForm(form);
  if (metadata.sourceType !== batch.sourceType) {
    return NextResponse.json({ error: "文件来源类型与批次不一致，请重新创建批次。" }, { status: 400 });
  }

  const categoryResult = await validateUploadCategory(metadata.categoryId);
  if ("error" in categoryResult) {
    return NextResponse.json({ error: categoryResult.error }, { status: categoryResult.status });
  }

  const file = fileResult.file;
  const selectedCategory = categoryResult.selectedCategory;
  const workspaceContext = await getDefaultWorkspaceContext();
  const destination = await storageService.createIncomingPath(batch.sourceType, file.name);
  const partPath = `${destination.absolutePath}.part`;
  try {
    await pipeline(
      Readable.fromWeb(file.stream() as unknown as NodeReadableStream<Uint8Array>),
      createWriteStream(partPath, { flags: "wx" })
    );
    await fs.rename(partPath, destination.absolutePath);
  } catch (error) {
    await fs.unlink(partPath).catch(() => undefined);
    return NextResponse.json({
      error: `文件写入待处理区失败：${(error as Error).message || "未知错误"}`
    }, { status: 500 });
  }
  const incomingRelativePath = storageService.toRelative(destination.absolutePath);
  let job;
  try {
    job = await prisma.ingestionJob.create({
      data: {
        workspaceId: workspaceContext.workspaceId,
        batchId,
        sourceType: batch.sourceType,
        incomingRelativePath,
        originalFileName: file.name,
        fileSize: byteSizeToBigInt(file.size),
        mimeType: file.type || null,
        uploaderName: metadata.uploaderName,
        shooterId: metadata.shooterId,
        shooterName: metadata.shooterName,
        categoryId: selectedCategory?.id || null,
        userSelectedCategoryId: selectedCategory?.id || null,
        rootCategory: metadata.rootCategory,
        subCategory: metadata.subCategory,
        customTags: metadata.customTags,
        notes: metadata.notes,
        manualAssetType: metadata.manualAssetType,
        status: "QUEUED"
      }
    });
  } catch (error) {
    await fs.unlink(destination.absolutePath).catch(() => undefined);
    return NextResponse.json({
      error: `文件已写入但创建后台任务失败，已清理临时文件：${(error as Error).message || "未知错误"}`
    }, { status: 500 });
  }

  return NextResponse.json(toJsonSafe({
    batchId,
    job: serializeUploadJob(job),
    message: "文件已接收，等待批次完成后进入后台处理。"
  }));
}

function readContentLength(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > 0 ? contentLength : 0;
}

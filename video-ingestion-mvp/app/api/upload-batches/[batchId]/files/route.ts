import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import Busboy from "busboy";
import { NextResponse } from "next/server";
import type { SourceType } from "@prisma/client";

import { canUseUploadSourceType, requireApiUser, uploadSourceDeniedResponse } from "@/app/api/_utils";

import { prisma } from "@/lib/prisma";
import { byteSizeToBigInt, toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

import { metadataFromJson, serializeUploadJob, validateUploadCategory } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ batchId: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  await storageService.initializeStorage();
  const { batchId } = await context.params;
  const batch = await prisma.importBatch.findUnique({ where: { batchId } });
  if (!batch) {
    return NextResponse.json({ error: "批次不存在。" }, { status: 404 });
  }
  if (batch.status !== "UPLOADING") {
    return NextResponse.json({ error: "批次已结束接收，不能继续上传文件。" }, { status: 409 });
  }
  if (!canUseUploadSourceType(auth.user, batch.sourceType)) return uploadSourceDeniedResponse();

  const uploadResult = await receiveMultipartUpload(request, batch.sourceType);
  if ("error" in uploadResult) {
    return NextResponse.json({ error: uploadResult.error }, { status: uploadResult.status });
  }

  const metadata = uploadResult.metadata;
  if (!canUseUploadSourceType(auth.user, metadata.sourceType)) {
    await fs.unlink(uploadResult.destination.absolutePath).catch(() => undefined);
    return uploadSourceDeniedResponse();
  }
  if (metadata.sourceType !== batch.sourceType) {
    await fs.unlink(uploadResult.destination.absolutePath).catch(() => undefined);
    return NextResponse.json({ error: "文件来源类型与批次不一致，请重新创建批次。" }, { status: 400 });
  }

  const categoryResult = await validateUploadCategory(metadata.categoryId);
  if ("error" in categoryResult) {
    await fs.unlink(uploadResult.destination.absolutePath).catch(() => undefined);
    return NextResponse.json({ error: categoryResult.error }, { status: categoryResult.status });
  }

  const selectedCategory = categoryResult.selectedCategory;
  const workspaceContext = await getDefaultWorkspaceContext();
  const incomingRelativePath = storageService.toRelative(uploadResult.destination.absolutePath);
  let job;
  try {
    job = await prisma.ingestionJob.create({
      data: {
        workspaceId: workspaceContext.workspaceId,
        batchId,
        sourceType: batch.sourceType,
        incomingRelativePath,
        originalFileName: uploadResult.fileName,
        fileSize: uploadResult.fileSize,
        mimeType: uploadResult.mimeType || null,
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
    await fs.unlink(uploadResult.destination.absolutePath).catch(() => undefined);
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

type StreamedUploadResult =
  | {
      metadata: ReturnType<typeof metadataFromJson>;
      destination: UploadDestination;
      fileName: string;
      fileSize: bigint;
      mimeType: string;
    }
  | { error: string; status: 400 | 500 };

type UploadDestination = Awaited<ReturnType<typeof storageService.createIncomingPath>>;

async function receiveMultipartUpload(request: Request, sourceType: SourceType): Promise<StreamedUploadResult> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return { error: "上传请求格式错误：请使用 multipart/form-data。", status: 400 };
  }
  if (!request.body) {
    return { error: "上传请求没有文件内容。", status: 400 };
  }

  const fields: Record<string, unknown> = {};
  let destination: UploadDestination | undefined;
  let partPath = "";
  let fileName = "";
  let mimeType = "";
  let fileSize = 0n;
  let fileCount = 0;
  let writePromise: Promise<void> | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const parser = Busboy({
        headers: Object.fromEntries(request.headers.entries()),
        defParamCharset: "utf8",
        limits: {
          fields: 32,
          fieldSize: 512 * 1024
        }
      });

      parser.on("field", (name, value) => {
        fields[name] = value;
      });

      parser.on("fieldsLimit", () => {
        fail(new Error("上传参数过多，请刷新页面后重试。"));
      });

      parser.on("file", (name, stream, info) => {
        if (name !== "file") {
          stream.resume();
          return;
        }
        fileCount += 1;
        if (fileCount > 1) {
          stream.resume();
          fail(new Error("一次只能上传一个文件，请分批重试。"));
          return;
        }

        fileName = info.filename || "upload.bin";
        mimeType = info.mimeType || "";
        writePromise = storageService.createIncomingPath(sourceType, fileName)
          .then(async (nextDestination) => {
            destination = nextDestination;
            partPath = `${nextDestination.absolutePath}.part`;
            stream.on("data", (chunk: Buffer) => {
              fileSize += BigInt(chunk.byteLength);
            });
            await pipeline(stream, createWriteStream(partPath, { flags: "wx" }));
            if (fileSize <= 0n) {
              await fs.unlink(partPath).catch(() => undefined);
              throw new Error("上传文件为空，请重新选择文件。");
            }
            await fs.rename(partPath, nextDestination.absolutePath);
            partPath = "";
          });
        writePromise.catch(fail);
      });

      parser.on("error", fail);
      parser.on("close", async () => {
        try {
          if (writePromise) await writePromise;
          finish();
        } catch (error) {
          fail(error);
        }
      });

      pipeline(
        Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>),
        parser
      ).catch(fail);
    });
  } catch (error) {
    if (partPath) await fs.unlink(partPath).catch(() => undefined);
    if (destination) await fs.unlink(destination.absolutePath).catch(() => undefined);
    return {
      error: `浏览器上传失败：${error instanceof Error ? error.message : String(error)}。请确认网络未中断、磁盘空间足够、存储目录可写后重试。`,
      status: 500
    };
  }

  if (!destination || !fileName) {
    return { error: "请选择要上传的文件。", status: 400 };
  }

  return {
    metadata: metadataFromJson(fields),
    destination,
    fileName,
    fileSize: byteSizeToBigInt(fileSize),
    mimeType
  };
}

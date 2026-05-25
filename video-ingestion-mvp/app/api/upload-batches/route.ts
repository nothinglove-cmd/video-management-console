import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { byteSizeToBigInt, toJsonSafe } from "@/lib/serialization/bigint-json";
import { storageService } from "@/lib/storage/storage.service";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

import { metadataFromJson, validateUploadCategory } from "./_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await storageService.initializeStorage();
  const body = await request.json().catch(() => ({}));
  const metadata = metadataFromJson(body);
  const fileCount = readNonNegativeInteger(body, "fileCount");
  const totalSize = readNonNegativeInteger(body, "totalSize");

  if (fileCount <= 0) {
    return NextResponse.json({ error: "请选择至少一个视频或图片文件。" }, { status: 400 });
  }

  const categoryResult = await validateUploadCategory(metadata.categoryId);
  if ("error" in categoryResult) {
    return NextResponse.json({ error: categoryResult.error }, { status: categoryResult.status });
  }

  const batchId = await storageService.createBatchId(metadata.sourceType);
  const workspaceContext = await getDefaultWorkspaceContext();
  const batch = await prisma.importBatch.create({
    data: {
      workspaceId: workspaceContext.workspaceId,
      batchId,
      sourceType: metadata.sourceType,
      uploaderName: metadata.uploaderName,
      fileCount,
      totalSize: byteSizeToBigInt(totalSize),
      status: "UPLOADING",
      notes: metadata.notes
    }
  });

  return NextResponse.json(toJsonSafe({
    batchId,
    batch,
    message: "批次已创建，浏览器将逐个上传文件。"
  }));
}

function readNonNegativeInteger(body: unknown, key: string) {
  if (!body || typeof body !== "object") return 0;
  const value = Number((body as Record<string, unknown>)[key]);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

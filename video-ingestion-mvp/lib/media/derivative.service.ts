import fs from "node:fs/promises";
import path from "node:path";
import type { DerivativeFile, Material } from "@prisma/client";

import { mediaService, type MediaInfo } from "@/lib/media/media.service";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";

const DERIVATIVES_ROOT = "_derivatives";

type ThumbnailDerivativeResult = {
  derivative: DerivativeFile;
  thumbnailPath: string | null;
  warnings: string[];
};

type AiFrameDerivativeResult = {
  derivatives: DerivativeFile[];
  warnings: string[];
};

type PreviewMp4DerivativeResult = {
  derivative: DerivativeFile | null;
  previewPath: string | null;
  warnings: string[];
};

export class DerivativeService {
  getMaterialDerivativeDirectory(materialId: string) {
    return path.join(DERIVATIVES_ROOT, materialId);
  }

  getThumbnailRelativePath(materialId: string) {
    return path.join(this.getMaterialDerivativeDirectory(materialId), "thumbnail.jpg");
  }

  getAiFramesDirectory(materialId: string) {
    return path.join(this.getMaterialDerivativeDirectory(materialId), "ai_frames");
  }

  getAiFrameRelativePath(materialId: string, frameIndex: number) {
    return path.join(this.getAiFramesDirectory(materialId), `frame_${String(frameIndex).padStart(3, "0")}.jpg`);
  }

  getPreviewMp4RelativePath(materialId: string) {
    return path.join(this.getMaterialDerivativeDirectory(materialId), "preview.mp4");
  }

  isManagedDerivativePath(relativePath?: string | null) {
    return Boolean(relativePath?.startsWith(`${DERIVATIVES_ROOT}${path.sep}`));
  }

  async generateThumbnailForMaterial(params: {
    material: Material;
    mediaInfo: MediaInfo;
  }): Promise<ThumbnailDerivativeResult> {
    const relativePath = this.getThumbnailRelativePath(params.material.materialId);
    const absolutePath = storageService.resolve(relativePath);

    try {
      const thumbnail = await mediaService.generateThumbnail({
        filePath: params.material.absolutePath,
        mediaInfo: params.mediaInfo,
        outputPath: absolutePath
      });

      if (!thumbnail.thumbnailPath) {
        const derivative = await this.upsertThumbnailDerivative({
          material: params.material,
          relativePath,
          absolutePath,
          status: "FAILED",
          errorMessage: thumbnail.warnings.join(" | ") || "缩略图生成失败。"
        });
        return { derivative, thumbnailPath: null, warnings: thumbnail.warnings };
      }

      const [stat, imageInfo] = await Promise.all([
        fs.stat(absolutePath),
        mediaService.readMediaInfo(absolutePath, "image/jpeg")
      ]);
      const derivative = await this.upsertThumbnailDerivative({
        material: params.material,
        relativePath,
        absolutePath,
        status: "READY",
        fileSize: stat.size,
        width: imageInfo.width,
        height: imageInfo.height,
        errorMessage: null
      });

      return {
        derivative,
        thumbnailPath: relativePath,
        warnings: [...thumbnail.warnings, ...imageInfo.warnings]
      };
    } catch (error) {
      const message = `缩略图生成失败，但入库流程会继续：${(error as Error).message}`;
      const derivative = await this.upsertThumbnailDerivative({
        material: params.material,
        relativePath,
        absolutePath,
        status: "FAILED",
        errorMessage: message
      });
      return { derivative, thumbnailPath: null, warnings: [message] };
    }
  }

  async findReadyThumbnail(materialId: string) {
    return prisma.derivativeFile.findFirst({
      where: {
        materialId,
        type: "THUMBNAIL",
        status: "READY"
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async saveAiFramesForMaterial(params: {
    material: Material;
    framePaths: string[];
  }): Promise<AiFrameDerivativeResult> {
    const framePaths = params.framePaths.filter(Boolean);
    const derivatives: DerivativeFile[] = [];
    const warnings: string[] = [];

    if (framePaths.length === 0) return { derivatives, warnings };

    await prisma.derivativeFile.updateMany({
      where: {
        materialId: params.material.materialId,
        type: "AI_FRAME",
        NOT: { status: "DELETED" }
      },
      data: { status: "DELETED" }
    });

    await fs.mkdir(storageService.resolve(this.getAiFramesDirectory(params.material.materialId)), { recursive: true });

    for (const [index, sourcePath] of framePaths.entries()) {
      const frameIndex = index + 1;
      const relativePath = this.getAiFrameRelativePath(params.material.materialId, frameIndex);
      const absolutePath = storageService.resolve(relativePath);

      try {
        await fs.copyFile(sourcePath, absolutePath);
        const stat = await fs.stat(absolutePath);
        derivatives.push(await this.createAiFrameDerivative({
          material: params.material,
          relativePath,
          absolutePath,
          status: "READY",
          fileSize: stat.size,
          frameIndex,
          errorMessage: null
        }));
      } catch (error) {
        const message = `AI 抽帧 ${frameIndex} 标准化失败，但入库流程会继续：${(error as Error).message}`;
        warnings.push(message);
        derivatives.push(await this.createAiFrameDerivative({
          material: params.material,
          relativePath,
          absolutePath,
          status: "FAILED",
          frameIndex,
          errorMessage: message
        }));
      }
    }

    return { derivatives, warnings };
  }

  async generatePreviewMp4ForMaterial(params: {
    material: Material;
    mediaInfo: MediaInfo;
  }): Promise<PreviewMp4DerivativeResult> {
    if (params.mediaInfo.isImage) {
      return { derivative: null, previewPath: null, warnings: [] };
    }

    const relativePath = this.getPreviewMp4RelativePath(params.material.materialId);
    const absolutePath = storageService.resolve(relativePath);

    try {
      const preview = await mediaService.generatePreviewMp4({
        filePath: params.material.absolutePath,
        mediaInfo: params.mediaInfo,
        outputPath: absolutePath
      });

      if (!preview.previewPath) {
        const derivative = await this.upsertPreviewMp4Derivative({
          material: params.material,
          relativePath,
          absolutePath,
          status: "FAILED",
          errorMessage: preview.warnings.join(" | ") || "preview MP4 生成失败。"
        });
        return { derivative, previewPath: null, warnings: preview.warnings };
      }

      const [stat, previewInfo] = await Promise.all([
        fs.stat(absolutePath),
        mediaService.readMediaInfo(absolutePath, "video/mp4")
      ]);
      const derivative = await this.upsertPreviewMp4Derivative({
        material: params.material,
        relativePath,
        absolutePath,
        status: "READY",
        fileSize: stat.size,
        width: previewInfo.width,
        height: previewInfo.height,
        duration: previewInfo.duration,
        errorMessage: null
      });

      return {
        derivative,
        previewPath: relativePath,
        warnings: [...preview.warnings, ...previewInfo.warnings]
      };
    } catch (error) {
      const message = `preview MP4 生成失败，但入库流程会继续：${(error as Error).message}`;
      const derivative = await this.upsertPreviewMp4Derivative({
        material: params.material,
        relativePath,
        absolutePath,
        status: "FAILED",
        errorMessage: message
      });
      return { derivative, previewPath: null, warnings: [message] };
    }
  }

  async findReadyPreviewMp4(materialId: string) {
    return prisma.derivativeFile.findFirst({
      where: {
        materialId,
        type: "PREVIEW_MP4",
        status: "READY"
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  private async upsertThumbnailDerivative(params: {
    material: Material;
    relativePath: string;
    absolutePath: string;
    status: "READY" | "FAILED";
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    errorMessage?: string | null;
  }) {
    const existing = await prisma.derivativeFile.findFirst({
      where: {
        materialId: params.material.materialId,
        type: "THUMBNAIL",
        NOT: { status: "DELETED" }
      },
      orderBy: { updatedAt: "desc" }
    });
    const data = {
      workspaceId: params.material.workspaceId,
      storageProviderId: params.material.storageProviderId,
      materialId: params.material.materialId,
      type: "THUMBNAIL" as const,
      status: params.status,
      relativePath: params.relativePath,
      absolutePath: params.absolutePath,
      fileName: path.basename(params.relativePath),
      mimeType: "image/jpeg",
      fileSize: params.fileSize ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
      errorMessage: params.errorMessage ?? null
    };

    if (existing) {
      return prisma.derivativeFile.update({
        where: { id: existing.id },
        data
      });
    }

    return prisma.derivativeFile.create({ data });
  }

  private async createAiFrameDerivative(params: {
    material: Material;
    relativePath: string;
    absolutePath: string;
    status: "READY" | "FAILED";
    fileSize?: number | null;
    frameIndex: number;
    errorMessage?: string | null;
  }) {
    return prisma.derivativeFile.create({
      data: {
        workspaceId: params.material.workspaceId,
        storageProviderId: params.material.storageProviderId,
        materialId: params.material.materialId,
        type: "AI_FRAME",
        status: params.status,
        relativePath: params.relativePath,
        absolutePath: params.absolutePath,
        fileName: path.basename(params.relativePath),
        mimeType: "image/jpeg",
        fileSize: params.fileSize ?? null,
        frameIndex: params.frameIndex,
        timecodeMs: null,
        errorMessage: params.errorMessage ?? null
      }
    });
  }

  private async upsertPreviewMp4Derivative(params: {
    material: Material;
    relativePath: string;
    absolutePath: string;
    status: "READY" | "FAILED";
    fileSize?: number | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    errorMessage?: string | null;
  }) {
    const existing = await prisma.derivativeFile.findFirst({
      where: {
        materialId: params.material.materialId,
        type: "PREVIEW_MP4",
        NOT: { status: "DELETED" }
      },
      orderBy: { updatedAt: "desc" }
    });
    const data = {
      workspaceId: params.material.workspaceId,
      storageProviderId: params.material.storageProviderId,
      materialId: params.material.materialId,
      type: "PREVIEW_MP4" as const,
      status: params.status,
      relativePath: params.relativePath,
      absolutePath: params.absolutePath,
      fileName: path.basename(params.relativePath),
      mimeType: "video/mp4",
      fileSize: params.fileSize ?? null,
      width: params.width ?? null,
      height: params.height ?? null,
      duration: params.duration ?? null,
      errorMessage: params.errorMessage ?? null
    };

    if (existing) {
      return prisma.derivativeFile.update({
        where: { id: existing.id },
        data
      });
    }

    return prisma.derivativeFile.create({ data });
  }
}

export const derivativeService = new DerivativeService();

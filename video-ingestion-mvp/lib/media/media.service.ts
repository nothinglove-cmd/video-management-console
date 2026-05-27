import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { resolveMediaBinary } from "@/lib/media/ffmpeg-binaries";

const execFileAsync = promisify(execFile);
const FFMPEG_VERSION_TIMEOUT_MS = 5000;
const FFPROBE_TIMEOUT_MS = 45000;
const FRAME_TIMEOUT_MS = 30000;
const THUMBNAIL_TIMEOUT_MS = 30000;
const PREVIEW_TIMEOUT_MS = 300000;
const LARGE_MEDIA_BYTES = 10 * 1024 ** 3;
const HUGE_MEDIA_BYTES = 50 * 1024 ** 3;
const LONG_VIDEO_SECONDS = 2 * 60 * 60;
const VERY_LONG_VIDEO_SECONDS = 6 * 60 * 60;
const FOUR_K_SHORT_EDGE = 2160;
const HIGH_FRAME_RATE = 50;

export type MediaInfo = {
  duration: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  orientation: "vertical" | "horizontal" | "square" | "unknown";
  isImage: boolean;
  warnings: string[];
};

export type MediaProcessingProfile = {
  fileSize: number | null;
  large: boolean;
  huge: boolean;
  long: boolean;
  veryLong: boolean;
  ultraHighResolution: boolean;
  highFrameRate: boolean;
  fourK60: boolean;
  maxKeyFrames: number;
  skipPreviewMp4: boolean;
  warnings: string[];
};

export type FrameExtractionResult = {
  frames: string[];
  warnings: string[];
};

export type PreviewMp4Result = {
  previewPath: string | null;
  warnings: string[];
};

type FfprobeStream = {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
};

type FfprobeResult = {
  format?: { duration?: string };
  streams?: FfprobeStream[];
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

async function binaryAvailable(binaryName: "ffmpeg" | "ffprobe") {
  try {
    await execFileAsync(resolveMediaBinary(binaryName), ["-version"], { timeout: FFMPEG_VERSION_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

function getOrientation(width: number | null, height: number | null): MediaInfo["orientation"] {
  if (!width || !height) return "unknown";
  if (Math.abs(width - height) <= 8) return "square";
  return height > width ? "vertical" : "horizontal";
}

function parseDuration(value?: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseFrameRate(value?: string) {
  if (!value || value === "0/0") return null;
  const [numerator, denominator] = value.split("/").map(Number);
  const parsed = denominator ? numerator / denominator : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function uniqueTimes(times: number[], duration: number, maxFrames = 8) {
  const clamped = times
    .map((time) => Math.max(0, Math.min(time, Math.max(duration - 0.2, 0))))
    .map((time) => Number(time.toFixed(2)));

  return Array.from(new Set(clamped)).slice(0, maxFrames);
}

function isLargeMedia(fileSize?: number | null) {
  return typeof fileSize === "number" && fileSize >= LARGE_MEDIA_BYTES;
}

function isHugeMedia(fileSize?: number | null) {
  return typeof fileSize === "number" && fileSize >= HUGE_MEDIA_BYTES;
}

function isLongVideo(duration?: number | null) {
  return typeof duration === "number" && duration >= LONG_VIDEO_SECONDS;
}

function isVeryLongVideo(duration?: number | null) {
  return typeof duration === "number" && duration >= VERY_LONG_VIDEO_SECONDS;
}

export class MediaService {
  async calculateChecksum(filePath: string) {
    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });
    return `sha256:${hash.digest("hex")}`;
  }

  isImage(filePath: string, mimeType?: string | null) {
    if (mimeType?.startsWith("image/")) return true;
    return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  async readMediaInfo(filePath: string, mimeType?: string | null): Promise<MediaInfo> {
    const isImage = this.isImage(filePath, mimeType);
    const warnings: string[] = [];

    if (!(await binaryAvailable("ffprobe"))) {
      warnings.push("未检测到 ffprobe：无法读取视频尺寸和时长，请安装 FFmpeg。");
      return {
        duration: isImage ? 0 : null,
        width: null,
        height: null,
        frameRate: null,
        orientation: "unknown",
        isImage,
        warnings
      };
    }

    try {
      const { stdout } = await execFileAsync(
        resolveMediaBinary("ffprobe"),
        [
          "-v",
          "error",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          filePath
        ],
        { timeout: FFPROBE_TIMEOUT_MS }
      );
      const probed = JSON.parse(stdout) as FfprobeResult;
      const stream = probed.streams?.find((item) => item.codec_type === "video") ?? probed.streams?.[0];
      const rotation =
        stream?.side_data_list?.find((sideData) => typeof sideData.rotation === "number")?.rotation ??
        Number(stream?.tags?.rotate ?? 0);
      const rawWidth = stream?.width ?? null;
      const rawHeight = stream?.height ?? null;
      const width = Math.abs(rotation) === 90 || Math.abs(rotation) === 270 ? rawHeight : rawWidth;
      const height = Math.abs(rotation) === 90 || Math.abs(rotation) === 270 ? rawWidth : rawHeight;

      return {
        duration: parseDuration(probed.format?.duration) ?? parseDuration(stream?.duration) ?? (isImage ? 0 : null),
        width,
        height,
        frameRate: parseFrameRate(stream?.avg_frame_rate) ?? parseFrameRate(stream?.r_frame_rate),
        orientation: getOrientation(width, height),
        isImage,
        warnings
      };
    } catch (error) {
      warnings.push(`ffprobe 读取失败或超时：${(error as Error).message}`);
      return {
        duration: isImage ? 0 : null,
        width: null,
        height: null,
        frameRate: null,
        orientation: "unknown",
        isImage,
        warnings
      };
    }
  }

  getProcessingProfile(params: { fileSize?: number | null; mediaInfo: MediaInfo }): MediaProcessingProfile {
    const fileSize = Number.isFinite(params.fileSize ?? NaN) ? params.fileSize ?? null : null;
    const width = params.mediaInfo.width ?? 0;
    const height = params.mediaInfo.height ?? 0;
    const longEdge = Math.max(width, height);
    const shortEdge = Math.min(width, height);
    const large = isLargeMedia(fileSize);
    const huge = isHugeMedia(fileSize);
    const long = isLongVideo(params.mediaInfo.duration);
    const veryLong = isVeryLongVideo(params.mediaInfo.duration);
    const ultraHighResolution = longEdge >= 3840 || shortEdge >= FOUR_K_SHORT_EDGE;
    const highFrameRate = Boolean(params.mediaInfo.frameRate && params.mediaInfo.frameRate >= HIGH_FRAME_RATE);
    const fourK60 = ultraHighResolution && highFrameRate;
    const maxKeyFrames = huge || veryLong ? 2 : large || long || fourK60 ? 4 : 8;
    const skipPreviewMp4 = huge || veryLong;
    const warnings: string[] = [];

    if (large) warnings.push(`大文件降级：10GB+ 原始文件最多抽取 ${maxKeyFrames} 帧。`);
    if (long) warnings.push(`长视频降级：2 小时以上视频最多抽取 ${maxKeyFrames} 帧。`);
    if (fourK60) warnings.push(`高规格视频降级：4K/高帧率视频最多抽取 ${maxKeyFrames} 帧。`);
    if (skipPreviewMp4) warnings.push("超大/超长视频降级：50GB+ 或 6 小时以上文件跳过 preview MP4。");

    return {
      fileSize,
      large,
      huge,
      long,
      veryLong,
      ultraHighResolution,
      highFrameRate,
      fourK60,
      maxKeyFrames,
      skipPreviewMp4,
      warnings
    };
  }

  getFrameTimes(duration: number | null, isImage: boolean, maxFrames = 8) {
    if (isImage) return [0];
    const safeDuration = duration && duration > 0 ? duration : 1;

    if (safeDuration <= 10) {
      return uniqueTimes([1, safeDuration / 2, Math.max(safeDuration - 1, 0)], safeDuration, maxFrames);
    }

    if (safeDuration <= 60) {
      return uniqueTimes(
        [2, safeDuration * 0.25, safeDuration * 0.5, safeDuration * 0.75, Math.max(safeDuration - 2, 0)],
        safeDuration,
        maxFrames
      );
    }

    const interval = Math.min(60, Math.max(10, safeDuration / Math.max(maxFrames - 1, 1)));
    const times: number[] = [];
    for (let time = 2; time < safeDuration - 2 && times.length < maxFrames; time += interval) {
      times.push(time);
    }
    if (times.length < maxFrames) times.push(Math.max(safeDuration - 2, 0));
    return uniqueTimes(times, safeDuration, maxFrames);
  }

  async extractKeyFrames(params: {
    filePath: string;
    mediaInfo: MediaInfo;
    outputDirectory: string;
    fileSize?: number | null;
  }): Promise<FrameExtractionResult> {
    const warnings: string[] = [...params.mediaInfo.warnings];
    await fs.mkdir(params.outputDirectory, { recursive: true });

    if (!(await binaryAvailable("ffmpeg"))) {
      warnings.push("未检测到 ffmpeg：已跳过抽帧和缩略图生成，入库会继续使用 mock/文本上下文。");
      return { frames: [], warnings };
    }

    const profile = this.getProcessingProfile({
      fileSize: params.fileSize,
      mediaInfo: params.mediaInfo
    });
    if (!params.mediaInfo.isImage) warnings.push(...profile.warnings);
    const frameTimes = this.getFrameTimes(params.mediaInfo.duration, params.mediaInfo.isImage, profile.maxKeyFrames);
    const frames: string[] = [];

    for (const [index, time] of frameTimes.entries()) {
      const outputPath = path.join(params.outputDirectory, `frame_${String(index + 1).padStart(2, "0")}.jpg`);
      const args = params.mediaInfo.isImage
        ? [
            "-y",
            "-i",
            params.filePath,
            "-frames:v",
            "1",
            "-vf",
            "scale=1280:-2",
            "-q:v",
            "4",
            outputPath
          ]
        : [
            "-y",
            "-ss",
            String(time),
            "-i",
            params.filePath,
            "-frames:v",
            "1",
            "-vf",
            "scale=1280:-2",
            "-q:v",
            "4",
            outputPath
          ];

      try {
        await execFileAsync(resolveMediaBinary("ffmpeg"), args, { timeout: FRAME_TIMEOUT_MS });
        frames.push(outputPath);
      } catch (error) {
        warnings.push(`关键帧 ${index + 1} 抽取失败：${(error as Error).message}`);
      }
    }

    return { frames, warnings };
  }

  async generateThumbnail(params: {
    filePath: string;
    mediaInfo: MediaInfo;
    outputPath: string;
  }) {
    const warnings: string[] = [];
    await fs.mkdir(path.dirname(params.outputPath), { recursive: true });

    if (!(await binaryAvailable("ffmpeg"))) {
      return {
        thumbnailPath: null,
        warnings: ["未检测到 ffmpeg：无法生成缩略图，请安装 FFmpeg。"]
      };
    }

    const duration = params.mediaInfo.duration ?? 1;
    const safeVideoSeekTime = Math.max(0, Math.min(1, duration / 2, Math.max(duration - 0.2, 0)));
    const seekTime = params.mediaInfo.isImage ? "0" : String(Number(safeVideoSeekTime.toFixed(2)));
    const args = params.mediaInfo.isImage
      ? [
          "-y",
          "-i",
          params.filePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2",
          "-q:v",
          "5",
          params.outputPath
        ]
      : [
          "-y",
          "-ss",
          seekTime,
          "-i",
          params.filePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:-2",
          "-q:v",
          "5",
          params.outputPath
        ];

    try {
      await execFileAsync(resolveMediaBinary("ffmpeg"), args, { timeout: THUMBNAIL_TIMEOUT_MS });
      return { thumbnailPath: params.outputPath, warnings };
    } catch (error) {
      warnings.push(`缩略图生成失败，但入库流程会继续：${(error as Error).message}`);
      return { thumbnailPath: null, warnings };
    }
  }

  async generatePreviewMp4(params: {
    filePath: string;
    mediaInfo: MediaInfo;
    outputPath: string;
    fileSize?: number | null;
  }): Promise<PreviewMp4Result> {
    const warnings: string[] = [];
    await fs.mkdir(path.dirname(params.outputPath), { recursive: true });

    if (params.mediaInfo.isImage) {
      return { previewPath: null, warnings: ["图片素材不生成 preview MP4。"] };
    }

    if (!(await binaryAvailable("ffmpeg"))) {
      return {
        previewPath: null,
        warnings: ["未检测到 ffmpeg：无法生成 preview MP4，请安装 FFmpeg。"]
      };
    }

    const profile = this.getProcessingProfile({
      fileSize: params.fileSize,
      mediaInfo: params.mediaInfo
    });
    if (profile.skipPreviewMp4) {
      return {
        previewPath: null,
        warnings: [...profile.warnings, "preview MP4 已按大文件降级策略跳过，原始文件入库继续。"]
      };
    }

    const scaleFilter = "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',format=yuv420p";
    const args = [
      "-y",
      "-ignore_unknown",
      "-i",
      params.filePath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      scaleFilter,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "28",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      params.outputPath
    ];

    try {
      await execFileAsync(resolveMediaBinary("ffmpeg"), args, { timeout: PREVIEW_TIMEOUT_MS });
      return { previewPath: params.outputPath, warnings };
    } catch (error) {
      warnings.push(`preview MP4 生成失败，但入库流程会继续：${(error as Error).message}`);
      return { previewPath: null, warnings };
    }
  }
}

export const mediaService = new MediaService();

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);

export type MediaInfo = {
  duration: number | null;
  width: number | null;
  height: number | null;
  orientation: "vertical" | "horizontal" | "square" | "unknown";
  isImage: boolean;
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
  tags?: Record<string, string>;
  side_data_list?: Array<{ rotation?: number }>;
};

type FfprobeResult = {
  format?: { duration?: string };
  streams?: FfprobeStream[];
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);

async function binaryAvailable(binaryName: string) {
  try {
    await execFileAsync(binaryName, ["-version"], { timeout: 5000 });
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

function uniqueTimes(times: number[], duration: number) {
  const clamped = times
    .map((time) => Math.max(0, Math.min(time, Math.max(duration - 0.2, 0))))
    .map((time) => Number(time.toFixed(2)));

  return Array.from(new Set(clamped)).slice(0, 8);
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
        orientation: "unknown",
        isImage,
        warnings
      };
    }

    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        filePath
      ]);
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
        orientation: getOrientation(width, height),
        isImage,
        warnings
      };
    } catch (error) {
      warnings.push(`ffprobe 读取失败：${(error as Error).message}`);
      return {
        duration: isImage ? 0 : null,
        width: null,
        height: null,
        orientation: "unknown",
        isImage,
        warnings
      };
    }
  }

  getFrameTimes(duration: number | null, isImage: boolean) {
    if (isImage) return [0];
    const safeDuration = duration && duration > 0 ? duration : 1;

    if (safeDuration <= 10) {
      return uniqueTimes([1, safeDuration / 2, Math.max(safeDuration - 1, 0)], safeDuration);
    }

    if (safeDuration <= 60) {
      return uniqueTimes(
        [2, safeDuration * 0.25, safeDuration * 0.5, safeDuration * 0.75, Math.max(safeDuration - 2, 0)],
        safeDuration
      );
    }

    const interval = Math.min(15, Math.max(10, safeDuration / 7));
    const times: number[] = [];
    for (let time = 2; time < safeDuration - 2 && times.length < 8; time += interval) {
      times.push(time);
    }
    if (times.length < 8) times.push(Math.max(safeDuration - 2, 0));
    return uniqueTimes(times, safeDuration);
  }

  async extractKeyFrames(params: {
    filePath: string;
    mediaInfo: MediaInfo;
    outputDirectory: string;
  }): Promise<FrameExtractionResult> {
    const warnings: string[] = [...params.mediaInfo.warnings];
    await fs.mkdir(params.outputDirectory, { recursive: true });

    if (!(await binaryAvailable("ffmpeg"))) {
      warnings.push("未检测到 ffmpeg：已跳过抽帧和缩略图生成，入库会继续使用 mock/文本上下文。");
      return { frames: [], warnings };
    }

    const frameTimes = this.getFrameTimes(params.mediaInfo.duration, params.mediaInfo.isImage);
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
        await execFileAsync("ffmpeg", args, { timeout: 30000 });
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
      await execFileAsync("ffmpeg", args, { timeout: 30000 });
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
      await execFileAsync("ffmpeg", args, { timeout: 300000 });
      return { previewPath: params.outputPath, warnings };
    } catch (error) {
      warnings.push(`preview MP4 生成失败，但入库流程会继续：${(error as Error).message}`);
      return { previewPath: null, warnings };
    }
  }
}

export const mediaService = new MediaService();

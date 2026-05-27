import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resolveMediaBinary } from "@/lib/media/ffmpeg-binaries";

const execFileAsync = promisify(execFile);

export type BinaryStatus = {
  available: boolean;
  versionLine: string;
  error?: string;
};

export type EnvironmentStatus = {
  mediaTools: {
    ffmpeg: BinaryStatus;
    ffprobe: BinaryStatus;
  };
};

export async function getEnvironmentStatus(): Promise<EnvironmentStatus> {
  const [ffmpeg, ffprobe] = await Promise.all([
    checkBinaryVersion("ffmpeg"),
    checkBinaryVersion("ffprobe")
  ]);

  return {
    mediaTools: {
      ffmpeg,
      ffprobe
    }
  };
}

async function checkBinaryVersion(binaryName: "ffmpeg" | "ffprobe"): Promise<BinaryStatus> {
  try {
    const result = await execFileAsync(resolveMediaBinary(binaryName), ["-version"], { timeout: 5000 });
    const versionLine = firstLine(result.stdout) || `${binaryName} available`;
    return {
      available: true,
      versionLine
    };
  } catch (error) {
    return {
      available: false,
      versionLine: "",
      error: error instanceof Error ? error.message : `${binaryName} is not available.`
    };
  }
}

function firstLine(value: string) {
  return value.split(/\r?\n/).find((line) => line.trim())?.trim() || "";
}

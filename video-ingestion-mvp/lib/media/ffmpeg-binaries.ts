import fs from "node:fs";
import path from "node:path";
import ffmpegStaticPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const projectRoot = process.cwd();

export function resolveMediaBinary(binaryName: "ffmpeg" | "ffprobe") {
  const envPath = binaryName === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const candidates = [
    envPath,
    runtimeBinaryPath(binaryName),
    binaryName === "ffmpeg" ? ffmpegStaticPath || "" : ffprobeStatic.path,
    binaryName
  ].filter((value): value is string => Boolean(value));

  return candidates.find((candidate) => candidate === binaryName || isExecutableFile(candidate)) || binaryName;
}

function runtimeBinaryPath(binaryName: "ffmpeg" | "ffprobe") {
  const executable = process.platform === "win32" ? `${binaryName}.exe` : binaryName;
  return path.join(projectRoot, ".runtime", "bin", executable);
}

function isExecutableFile(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

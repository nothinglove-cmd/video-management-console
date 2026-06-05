import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const projectRoot = process.cwd();
const runtimeRequire = createRequire(import.meta.url);

export function resolveMediaBinary(binaryName: "ffmpeg" | "ffprobe") {
  const envPath = binaryName === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  const candidates = [
    envPath,
    runtimeBinaryPath(binaryName),
    binaryName === "ffmpeg" ? optionalFfmpegStaticPath() : optionalFfprobeStaticPath(),
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

function optionalFfmpegStaticPath() {
  try {
    const packageName = "ffmpeg" + "-static";
    const loaded = runtimeRequire(packageName) as string | { default?: string | null } | null;
    if (typeof loaded === "string") return loaded;
    return loaded?.default || "";
  } catch {
    return "";
  }
}

function optionalFfprobeStaticPath() {
  try {
    const packageName = "ffprobe" + "-static";
    const loaded = runtimeRequire(packageName) as { path?: string; default?: { path?: string } } | null;
    return loaded?.path || loaded?.default?.path || "";
  } catch {
    return "";
  }
}

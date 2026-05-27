#!/usr/bin/env node
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

const projectRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(projectRoot, ".runtime");
const runtimeBin = path.join(runtimeRoot, "bin");
const nodeRoot = path.join(runtimeRoot, "node");
const envPath = path.join(projectRoot, ".env");
const prismaDir = path.join(projectRoot, "prisma");
const defaultStorageRoot = path.join(os.homedir(), "VideoIngestionStorage");
let generatedInitialAdminPassword = "";

const isWindows = process.platform === "win32";

main().catch((error) => {
  console.error("");
  console.error("安装失败：", error && error.message ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  process.chdir(projectRoot);
  if (process.env.VIDEO_INSTALL_SELF_TEST === "1") {
    await runSelfTest();
    return;
  }

  printTitle("AI 素材入库系统 - 全新安装");
  console.log("安装器会自动准备 Node.js、FFmpeg、数据库和默认工作区。");
  console.log("安装阶段只需要选择素材存储目录；AI Key 可以进入系统后台后再配置。");
  console.log("数据库会按全新安装重建，但不会删除素材存储目录里的已有文件。");

  await pressEnterToContinue();
  const storageRoot = await chooseStorageRoot();

  await ensureFreshStorageRoot(storageRoot);
  await writeEnvFile(storageRoot);
  await removeFreshDatabaseFiles();

  await runStep("安装项目依赖", npmCommand(), ["ci"]);
  await createFfmpegShims();
  await runStep("初始化数据库", npmCommand(), ["run", "db:push"]);
  await runStep("初始化默认工作区", npmCommand(), ["run", "init:workspace"]);
  await runStep("检查安装环境", npmCommand(), ["run", "check:env"]);
  await runStep("构建系统", npmCommand(), ["run", "build"]);

  printComplete(storageRoot);
}

function printTitle(title) {
  console.log("");
  console.log("=".repeat(title.length + 8));
  console.log(`=== ${title} ===`);
  console.log("=".repeat(title.length + 8));
  console.log("");
}

function printStep(message) {
  console.log("");
  console.log(`== ${message} ==`);
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(question) {
  if (process.env.VIDEO_INSTALL_YES === "1") return Promise.resolve("");
  const rl = createInterface();
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function pressEnterToContinue() {
  if (process.env.VIDEO_INSTALL_YES === "1") return;
  const answer = (await ask("按回车开始安装；输入 q 后回车可退出：")).trim().toLowerCase();
  if (answer === "q" || answer === "quit" || answer === "exit") {
    console.log("已取消安装。");
    process.exit(0);
  }
}

async function chooseStorageRoot() {
  const configured = process.env.VIDEO_INSTALL_STORAGE_ROOT;
  const answer = configured || await ask(`请选择素材存储目录，直接回车使用默认目录：\n${defaultStorageRoot}\n> `);
  const requestedPath = normalizeInputPath(answer || defaultStorageRoot);
  assertSafeStorageRoot(requestedPath);

  return await pickFreshStorageRoot(requestedPath);
}

async function pickFreshStorageRoot(requestedPath) {
  if (!(await exists(requestedPath))) return requestedPath;

  const entries = await fsp.readdir(requestedPath).catch(() => []);
  if (entries.length === 0) return requestedPath;

  const parent = path.basename(requestedPath) === "VideoIngestionStorage"
    ? path.dirname(requestedPath)
    : requestedPath;
  const preferred = path.join(parent, "VideoIngestionStorage");
  const freshPath = await uniqueDirectoryPath(preferred);

  console.log("");
  console.log("检测到所选目录不是空目录。为避免新旧文件混在一起，安装器会使用这个全新目录：");
  console.log(freshPath);
  assertSafeStorageRoot(freshPath);
  return freshPath;
}

async function uniqueDirectoryPath(preferredPath) {
  if (!(await exists(preferredPath))) return preferredPath;
  const entries = await fsp.readdir(preferredPath).catch(() => []);
  if (entries.length === 0) return preferredPath;

  const parent = path.dirname(preferredPath);
  const base = path.basename(preferredPath);
  const stamp = timestampForPath();
  for (let index = 0; index < 100; index += 1) {
    const suffix = index === 0 ? stamp : `${stamp}-${index + 1}`;
    const candidate = path.join(parent, `${base}-${suffix}`);
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error("无法创建唯一的素材存储目录，请换一个目录后重试。");
}

function timestampForPath() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];
  return `${parts.slice(0, 3).join("")}-${parts.slice(3).join("")}`;
}

function normalizeInputPath(value) {
  let input = String(value || "").trim();
  if (
    (input.startsWith('"') && input.endsWith('"')) ||
    (input.startsWith("'") && input.endsWith("'"))
  ) {
    input = input.slice(1, -1);
  }
  if (input === "~") input = os.homedir();
  if (input.startsWith(`~${path.sep}`) || input.startsWith("~/")) {
    input = path.join(os.homedir(), input.slice(2));
  }
  return path.resolve(input);
}

function assertSafeStorageRoot(storageRoot) {
  const resolved = path.resolve(storageRoot);
  const home = path.resolve(os.homedir());
  const project = path.resolve(projectRoot);
  const root = path.parse(resolved).root;
  const dangerous = new Set([
    root,
    home,
    project,
    path.join(project, "prisma"),
    path.join(project, "node_modules"),
    path.join(project, ".next"),
    path.join(project, ".runtime")
  ]);

  if (isWindows) {
    dangerous.add(path.resolve("C:\\Windows"));
    dangerous.add(path.resolve("C:\\Program Files"));
    dangerous.add(path.resolve("C:\\Program Files (x86)"));
  } else {
    for (const item of ["/bin", "/etc", "/lib", "/opt", "/sbin", "/usr", "/var", "/System", "/Library", "/Applications"]) {
      dangerous.add(path.resolve(item));
    }
  }

  if (dangerous.has(resolved)) {
    throw new Error(`素材存储目录不能设置为系统目录、用户主目录或项目目录：${resolved}`);
  }

  const projectWithSep = project.endsWith(path.sep) ? project : `${project}${path.sep}`;
  if (resolved.startsWith(projectWithSep)) {
    throw new Error(`素材存储目录不能放在项目代码目录内部：${resolved}`);
  }
}

async function ensureFreshStorageRoot(storageRoot) {
  printStep("准备素材存储目录");
  await fsp.mkdir(storageRoot, { recursive: true });
  const stat = await fsp.stat(storageRoot);
  if (!stat.isDirectory()) {
    throw new Error(`素材存储路径不是目录：${storageRoot}`);
  }
  await fsp.access(storageRoot, fs.constants.W_OK);
  console.log(storageRoot);
}

async function writeEnvFile(storageRoot) {
  printStep("生成配置文件");
  const storageRootForEnv = isWindows ? storageRoot.replace(/\\/g, "/") : storageRoot;
  generatedInitialAdminPassword = randomReadablePassword();
  const content = [
    "# Auto-generated by install/runtime-installer.js",
    `STORAGE_ROOT="${escapeEnvValue(storageRootForEnv)}"`,
    'DATABASE_URL="file:./dev.db"',
    `AUTH_SECRET="${randomBytes(32).toString("base64url")}"`,
    'INITIAL_ADMIN_USERNAME="admin"',
    'INITIAL_ADMIN_DISPLAY_NAME="超级管理员"',
    `INITIAL_ADMIN_PASSWORD="${generatedInitialAdminPassword}"`,
    "",
    "AI_PROVIDER=mock",
    "AI_MODEL=gpt-4.1-mini",
    "AI_BASE_URL=",
    "AI_API_KEY=",
    "AI_FALLBACK_PROVIDER=mock",
    "",
    "OPENAI_API_KEY=",
    "",
    "ARK_API_KEY=",
    "VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3",
    "",
    "AI_FRAME_MAX=5",
    "AI_IMAGE_DETAIL=low",
    "AI_REQUEST_TIMEOUT_MS=60000",
    "",
    "LOCAL_AI_BASE_URL=",
    "LOCAL_AI_API_KEY=",
    "LOCAL_AI_MODEL=",
    "LOCAL_AI_HEALTHCHECK_URL=",
    ""
  ].join(os.EOL);
  await fsp.writeFile(envPath, content, "utf8");
  console.log(path.relative(projectRoot, envPath));
}

function escapeEnvValue(value) {
  return String(value).replace(/"/g, '\\"');
}

function randomReadablePassword(length = 16) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(length);
  let password = "";
  for (const byte of bytes) password += alphabet[byte % alphabet.length];
  return password;
}

async function removeFreshDatabaseFiles() {
  printStep("重建全新数据库文件");
  const dbFiles = [
    path.join(prismaDir, "dev.db"),
    path.join(prismaDir, "dev.db-journal"),
    path.join(prismaDir, "dev.db-wal"),
    path.join(prismaDir, "dev.db-shm"),
    path.join(projectRoot, "dev.db"),
    path.join(projectRoot, "dev.db-journal"),
    path.join(projectRoot, "dev.db-wal"),
    path.join(projectRoot, "dev.db-shm")
  ];

  for (const file of dbFiles) {
    await fsp.rm(file, { force: true }).catch(() => undefined);
  }
  await fsp.rm(path.join(projectRoot, ".next"), { recursive: true, force: true }).catch(() => undefined);
  console.log("数据库将以全新状态初始化。");
}

async function createFfmpegShims() {
  printStep("连接 FFmpeg 到项目运行环境");
  const ffmpegPath = resolveFfmpegPath();
  const ffprobePath = resolveFfprobePath();
  await fsp.mkdir(runtimeBin, { recursive: true });

  if (isWindows) {
    const runtimeFfmpegPath = path.join(runtimeBin, "ffmpeg.exe");
    const runtimeFfprobePath = path.join(runtimeBin, "ffprobe.exe");
    await fsp.copyFile(ffmpegPath, runtimeFfmpegPath);
    await fsp.copyFile(ffprobePath, runtimeFfprobePath);
    await fsp.writeFile(path.join(runtimeBin, "ffmpeg.cmd"), windowsShim(runtimeFfmpegPath), "utf8");
    await fsp.writeFile(path.join(runtimeBin, "ffprobe.cmd"), windowsShim(runtimeFfprobePath), "utf8");
  } else {
    const ffmpegShim = path.join(runtimeBin, "ffmpeg");
    const ffprobeShim = path.join(runtimeBin, "ffprobe");
    await fsp.copyFile(ffmpegPath, ffmpegShim);
    await fsp.copyFile(ffprobePath, ffprobeShim);
    await fsp.chmod(ffmpegShim, 0o755);
    await fsp.chmod(ffprobeShim, 0o755);
  }

  await runStep("验证 FFmpeg", path.join(runtimeBin, isWindows ? "ffmpeg.exe" : "ffmpeg"), ["-version"]);
  await runStep("验证 ffprobe", path.join(runtimeBin, isWindows ? "ffprobe.exe" : "ffprobe"), ["-version"]);
}

function resolveFfmpegPath() {
  const resolved = require.resolve("ffmpeg-static", { paths: [projectRoot] });
  const value = require(resolved);
  if (typeof value !== "string" || !value) {
    throw new Error("ffmpeg-static 未返回可执行文件路径。");
  }
  return value;
}

function resolveFfprobePath() {
  const resolved = require.resolve("ffprobe-static", { paths: [projectRoot] });
  const value = require(resolved);
  const binaryPath = typeof value === "string" ? value : value && value.path;
  if (typeof binaryPath !== "string" || !binaryPath) {
    throw new Error("ffprobe-static 未返回可执行文件路径。");
  }
  return binaryPath;
}

function windowsShim(binaryPath) {
  return [
    "@echo off",
    `"${binaryPath}" %*`,
    ""
  ].join("\r\n");
}

async function runStep(label, command, args) {
  printStep(label);
  await run(command, args);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: installEnv(),
      stdio: "inherit",
      shell: isWindows
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} 执行失败，退出码 ${code}`));
    });
  });
}

function installEnv() {
  const pathItems = [
    runtimeBin,
    nodeBinDir(),
    process.env.PATH || ""
  ].filter(Boolean);

  return {
    ...process.env,
    PATH: pathItems.join(path.delimiter),
    npm_config_fetch_retries: process.env.npm_config_fetch_retries || "3",
    npm_config_fetch_timeout: process.env.npm_config_fetch_timeout || "300000",
    npm_config_fetch_retry_maxtimeout: process.env.npm_config_fetch_retry_maxtimeout || "120000"
  };
}

function nodeBinDir() {
  return isWindows ? nodeRoot : path.join(nodeRoot, "bin");
}

function npmCommand() {
  if (isWindows) return "npm.cmd";
  const bundledNpm = path.join(nodeRoot, "bin", "npm");
  if (fs.existsSync(bundledNpm)) return bundledNpm;
  return "npm";
}

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printComplete(storageRoot) {
  printTitle("安装完成");
  console.log(`素材存储目录：${storageRoot}`);
  if (generatedInitialAdminPassword) {
    console.log("");
    console.log("初始超级管理员：");
    console.log("用户名：admin");
    console.log(`密码：${generatedInitialAdminPassword}`);
    console.log("首次登录后系统会要求修改密码。");
  }
  console.log("");
  console.log("启动方式：");
  console.log(isWindows ? "双击 启动-windows.bat" : "双击 启动-mac.command，或运行 ./install/start-mac-linux.sh");
  console.log("");
  console.log("后台地址：");
  console.log("http://localhost:8888/admin");
  console.log("");
  console.log("电脑上传：");
  console.log("http://localhost:8888/upload");
  console.log("");
  console.log("手机上传地址可在系统设置页查看局域网地址。");
}

async function runSelfTest() {
  printTitle("安装器自检");
  const testParent = path.join(os.tmpdir(), `video-installer-self-test-${process.pid}`);
  const nonEmpty = path.join(testParent, "non-empty");
  const oldEnvPath = await exists(envPath) ? await fsp.readFile(envPath, "utf8") : null;
  await fsp.mkdir(nonEmpty, { recursive: true });
  await fsp.writeFile(path.join(nonEmpty, "keep.txt"), "do not delete", "utf8");

  try {
    const fresh = await pickFreshStorageRoot(nonEmpty);
    if (fresh === nonEmpty) throw new Error("非空目录没有被切换到全新目录。");
    assertSafeStorageRoot(fresh);

    await writeEnvFile(fresh);
    const envContent = await fsp.readFile(envPath, "utf8");
    if (!envContent.includes("AI_PROVIDER=mock")) throw new Error(".env 没有写入 mock AI 默认配置。");
    if (!envContent.includes('DATABASE_URL="file:./dev.db"')) throw new Error(".env 没有写入 SQLite 默认配置。");
    if (!envContent.includes("AUTH_SECRET=")) throw new Error(".env 没有写入 AUTH_SECRET。");
    if (!envContent.includes("INITIAL_ADMIN_PASSWORD=")) throw new Error(".env 没有写入初始管理员密码。");

    console.log("自检通过。");
  } finally {
    if (oldEnvPath === null) await fsp.rm(envPath, { force: true });
    else await fsp.writeFile(envPath, oldEnvPath, "utf8");
    await fsp.rm(testParent, { recursive: true, force: true }).catch(() => undefined);
  }
}

import { execFile } from "node:child_process";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type EnvMap = Record<string, string>;
type CheckStatus = "pass" | "warn" | "fail";

const projectRoot = process.cwd();
const envPath = path.join(projectRoot, ".env");
const packageJsonPath = path.join(projectRoot, "package.json");
const packageLockPath = path.join(projectRoot, "package-lock.json");
const prismaDevDbPath = path.join(projectRoot, "prisma", "dev.db");

const results: Array<{ status: CheckStatus; label: string; message: string }> = [];

function add(status: CheckStatus, label: string, message: string) {
  results.push({ status, label, message });
}

function parseEnv(content: string): EnvMap {
  const env: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) continue;
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function checkWritableDirectory(directoryPath: string): Promise<"ok" | "mode-only" | "no"> {
  try {
    await fs.access(directoryPath, constants.W_OK);
    return "ok";
  } catch {
    const stat = await fs.stat(directoryPath).catch(() => null);
    if (!stat?.isDirectory()) return "no";
    const currentUid = typeof process.getuid === "function" ? process.getuid() : os.userInfo().uid;
    const currentGroups = typeof process.getgroups === "function" ? process.getgroups() : [];
    const ownerWritable = stat.uid === currentUid && Boolean(stat.mode & 0o200);
    const groupWritable = currentGroups.includes(stat.gid) && Boolean(stat.mode & 0o020);
    const otherWritable = Boolean(stat.mode & 0o002);
    return ownerWritable || groupWritable || otherWritable ? "mode-only" : "no";
  }
}

async function nearestExistingDirectory(inputPath: string) {
  let current = path.resolve(inputPath);
  while (!(await exists(current))) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  const stat = await fs.stat(current).catch(() => null);
  return stat?.isDirectory() ? current : path.dirname(current);
}

function isDangerousStorageRoot(storageRoot: string) {
  const resolved = path.resolve(storageRoot);
  const homeDir = path.resolve(os.homedir());
  const project = path.resolve(projectRoot);
  const dangerousExactPaths = new Set([
    path.parse(resolved).root,
    path.resolve("/Users"),
    path.resolve("/Applications"),
    path.resolve("/System"),
    path.resolve("/Library"),
    path.resolve("/bin"),
    path.resolve("/sbin"),
    path.resolve("/usr"),
    path.resolve("/var"),
    path.resolve("/private"),
    homeDir,
    project,
    path.join(project, "prisma"),
    path.join(project, "node_modules"),
    path.join(project, ".next")
  ]);

  if (dangerousExactPaths.has(resolved)) return true;
  const projectWithSep = project.endsWith(path.sep) ? project : `${project}${path.sep}`;
  return resolved.startsWith(projectWithSep);
}

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) return null;
  const rawPath = databaseUrl.slice("file:".length);
  if (!rawPath) return null;
  if (path.isAbsolute(rawPath)) return rawPath;
  return path.resolve(projectRoot, "prisma", rawPath);
}

async function checkBinary(binaryName: string) {
  try {
    await execFileAsync(binaryName, ["-version"], { timeout: 5000 });
    add("pass", binaryName, `${binaryName} is available.`);
  } catch {
    add("warn", binaryName, `${binaryName} is not available in PATH.`);
  }
}

function readDependencyMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, string>;
}

async function checkPackageLock() {
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
  const packageLock = JSON.parse(await fs.readFile(packageLockPath, "utf8"));
  const rootPackage = packageLock.packages?.[""];
  if (!rootPackage) {
    add("fail", "package-lock", "package-lock.json is missing the root package entry.");
    return;
  }

  const packageDeps = readDependencyMap(packageJson.dependencies);
  const packageDevDeps = readDependencyMap(packageJson.devDependencies);
  const lockDeps = readDependencyMap(rootPackage.dependencies);
  const lockDevDeps = readDependencyMap(rootPackage.devDependencies);

  const mismatches: string[] = [];
  for (const [name, version] of Object.entries(packageDeps)) {
    if (lockDeps[name] !== version) mismatches.push(`dependencies.${name}`);
  }
  for (const [name, version] of Object.entries(packageDevDeps)) {
    if (lockDevDeps[name] !== version) mismatches.push(`devDependencies.${name}`);
  }

  if (!packageLock.packages?.["node_modules/sucrase"]) {
    mismatches.push("node_modules/sucrase");
  }

  if (mismatches.length > 0) {
    add("fail", "package-lock", `package.json and package-lock.json are not synchronized: ${mismatches.join(", ")}.`);
    return;
  }

  add("pass", "package-lock", "package.json and package-lock.json root dependencies are synchronized.");
}

function checkAiProvider(env: EnvMap) {
  const allowedProviders = new Set([
    "mock",
    "openai",
    "volcengine",
    "local",
    "local_openai_compatible",
    "local_ollama"
  ]);
  const provider = (env.AI_PROVIDER || "mock").toLowerCase();
  const fallbackProvider = (env.AI_FALLBACK_PROVIDER || "mock").toLowerCase();

  if (!allowedProviders.has(provider)) {
    add("fail", "AI_PROVIDER", `AI_PROVIDER is invalid. Current value is "${provider}".`);
    return;
  }
  add("pass", "AI_PROVIDER", `AI_PROVIDER is "${provider}".`);

  if (!allowedProviders.has(fallbackProvider)) {
    add("fail", "AI_FALLBACK_PROVIDER", `AI_FALLBACK_PROVIDER is invalid. Current value is "${fallbackProvider}".`);
  } else {
    add("pass", "AI_FALLBACK_PROVIDER", `AI_FALLBACK_PROVIDER is "${fallbackProvider}".`);
  }

  if (provider === "openai" && !env.OPENAI_API_KEY) {
    add("warn", "OpenAI", "AI_PROVIDER=openai but OPENAI_API_KEY is empty. Runtime should fallback if configured.");
  }

  if (provider === "volcengine") {
    if (!env.ARK_API_KEY) add("warn", "Volcengine", "AI_PROVIDER=volcengine but ARK_API_KEY is empty.");
    if (!env.VOLCENGINE_BASE_URL) add("warn", "Volcengine", "VOLCENGINE_BASE_URL is empty; runtime default may be used.");
  }

  if (provider === "local") {
    add("warn", "Local AI", "AI_PROVIDER=local is a legacy placeholder and currently falls back to mock.");
  }

  if (provider === "local_openai_compatible") {
    if (!env.LOCAL_AI_BASE_URL && !env.AI_BASE_URL) {
      add("warn", "Local AI", "local_openai_compatible has no LOCAL_AI_BASE_URL or AI_BASE_URL.");
    }
    if (!env.LOCAL_AI_API_KEY && !env.AI_API_KEY && !env.OPENAI_API_KEY) {
      add("warn", "Local AI", "local_openai_compatible has no LOCAL_AI_API_KEY, AI_API_KEY, or OPENAI_API_KEY.");
    }
    if (!env.LOCAL_AI_MODEL && !env.AI_MODEL) {
      add("warn", "Local AI", "local_openai_compatible has no LOCAL_AI_MODEL or AI_MODEL.");
    }
  }

  if (provider === "local_ollama" && !env.LOCAL_AI_BASE_URL && !env.AI_BASE_URL && !env.LOCAL_AI_HEALTHCHECK_URL) {
    add("warn", "Local AI", "local_ollama has no local URL configured; runtime may use its built-in Ollama default.");
  }
}

async function main() {
  if (!(await exists(envPath))) {
    add("fail", ".env", ".env file does not exist. Copy .env.example to .env and edit it.");
  }

  const env = (await exists(envPath)) ? parseEnv(await fs.readFile(envPath, "utf8")) : {};

  const databaseUrl = env.DATABASE_URL || "";
  const databasePath = resolveDatabasePath(databaseUrl);
  if (!databaseUrl) {
    add("fail", "DATABASE_URL", "DATABASE_URL is not configured.");
  } else if (!databasePath) {
    add("fail", "DATABASE_URL", "DATABASE_URL must be a SQLite file URL, for example file:./dev.db.");
  } else {
    add("pass", "DATABASE_URL", `SQLite file URL resolves to ${path.relative(projectRoot, databasePath)}.`);
  }

  if (await exists(prismaDevDbPath)) {
    add("pass", "SQLite", "prisma/dev.db exists.");
  } else {
    add("warn", "SQLite", "prisma/dev.db does not exist yet. Run npm run db:push after backing up existing data if needed.");
  }

  const authSecret = env.AUTH_SECRET || "";
  if (!authSecret) {
    add("fail", "AUTH_SECRET", "AUTH_SECRET is not configured.");
  } else if (authSecret.length < 32) {
    add("fail", "AUTH_SECRET", "AUTH_SECRET must be at least 32 characters.");
  } else {
    add("pass", "AUTH_SECRET", "AUTH_SECRET is configured.");
  }

  const storageRoot = env.STORAGE_ROOT || "";
  if (!storageRoot) {
    add("fail", "STORAGE_ROOT", "STORAGE_ROOT is not configured.");
  } else {
    const resolvedStorageRoot = path.resolve(storageRoot);
    if (isDangerousStorageRoot(resolvedStorageRoot)) {
      add("fail", "STORAGE_ROOT", `STORAGE_ROOT points to a dangerous path: ${resolvedStorageRoot}.`);
    } else {
      add("pass", "STORAGE_ROOT", `STORAGE_ROOT is ${resolvedStorageRoot}.`);
    }

    const writableDirectory = (await exists(resolvedStorageRoot))
      ? resolvedStorageRoot
      : await nearestExistingDirectory(path.dirname(resolvedStorageRoot));
    if (!writableDirectory) {
      add("fail", "STORAGE_ROOT", "No existing parent directory was found for STORAGE_ROOT.");
    } else {
      const writableStatus = await checkWritableDirectory(writableDirectory);
      if (writableStatus === "ok") {
        add("pass", "STORAGE_ROOT", `Writable directory check passed at ${writableDirectory}.`);
      } else if (writableStatus === "mode-only") {
        add(
          "warn",
          "STORAGE_ROOT",
          `Direct writable check was denied, but POSIX permissions indicate ${writableDirectory} is writable by this user. Re-run on the target machine if deployment still fails.`
        );
      } else {
        add("fail", "STORAGE_ROOT", `Cannot write to ${writableDirectory}.`);
      }
    }
  }

  await checkBinary("ffmpeg");
  await checkBinary("ffprobe");
  await checkPackageLock();
  checkAiProvider(env);

  for (const result of results) {
    const prefix = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${prefix}] ${result.label}: ${result.message}`);
  }

  const failCount = results.filter((result) => result.status === "fail").length;
  const warnCount = results.filter((result) => result.status === "warn").length;
  console.log(`Summary: ${failCount} failure(s), ${warnCount} warning(s).`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[FAIL] check-env:", (error as Error).message);
  process.exitCode = 1;
});

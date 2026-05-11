import fs from "node:fs/promises";
import path from "node:path";

import { prisma } from "../lib/prisma";
import { getStorageRoot } from "../lib/config";

const TARGET_MATERIAL_ID = "MAT20260511-002";
const TARGET_BATCH_ID = "WEB-DESKTOP-UPLOAD-20260511-60b03893";
const TARGET_ORIGINAL_FILE = "video-ingestion-e2e-test.mp4";
const TARGET_METADATA_RELATIVE_PATH = "01_待导入/失败/metadata/MAT20260511-002.json";
const TARGET_FAILED_FILE_RELATIVE_PATH = "01_待导入/失败/video-ingestion-e2e-test.mp4";
const PROCESSING_ROOT = "01_待导入/处理中";
const CONFIRM_PHRASE = "DELETE_E2E_ARTIFACTS";

type CleanupPlan = {
  backupPath: string | null;
  materialExists: boolean;
  fileOperationLogIds: string[];
  failedIngestionJobIds: string[];
  keptBatchMaterialIds: string[];
  metadataFiles: string[];
  failedFiles: string[];
  processingFrames: string[];
  blockedReason?: string;
};

function timestampForBackup() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toPosix(value: string) {
  return value.split(path.sep).join("/");
}

function resolveStoragePath(relativePath: string) {
  return path.join(getStorageRoot(), ...relativePath.split("/"));
}

async function backupDatabase() {
  const source = path.join(process.cwd(), "prisma", "dev.db");
  if (!(await exists(source))) {
    throw new Error("prisma/dev.db does not exist. Cleanup requires an SQLite backup first.");
  }

  const backupBase = path.join(process.cwd(), "prisma", `dev.db.cleanup-e2e-backup-${timestampForBackup()}`);
  let target = backupBase;
  let suffix = 2;
  while (await exists(target)) {
    target = `${backupBase}-${suffix}`;
    suffix += 1;
  }

  await fs.copyFile(source, target);
  return target;
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function isWhitelistedProcessingFrame(relativePath: string) {
  const normalized = toPosix(relativePath);
  if (!normalized.startsWith(`${PROCESSING_ROOT}/`)) return false;
  if (!/^frame_\d+\.jpg$/i.test(path.posix.basename(normalized))) return false;
  const parts = normalized.split("/");
  const taskDirectory = parts[2] || "";
  return taskDirectory.startsWith("REANALYZE-") || /^WEB-.*UPLOAD-/.test(taskDirectory);
}

async function findProcessingFrames() {
  const storageRoot = getStorageRoot();
  const processingRoot = resolveStoragePath(PROCESSING_ROOT);
  const files = await walkFiles(processingRoot);
  return files
    .map((file) => toPosix(path.relative(storageRoot, file)))
    .filter(isWhitelistedProcessingFrame)
    .sort();
}

async function buildCleanupPlan(): Promise<CleanupPlan> {
  const [material, logs, derivativeCount, aiJobCount, failedJobs, keptBatchMaterials] = await Promise.all([
    prisma.material.findUnique({ where: { materialId: TARGET_MATERIAL_ID } }),
    prisma.fileOperationLog.findMany({ where: { materialId: TARGET_MATERIAL_ID }, select: { id: true } }),
    prisma.derivativeFile.count({ where: { materialId: TARGET_MATERIAL_ID } }),
    prisma.aIAnalysisJob.count({ where: { materialId: TARGET_MATERIAL_ID } }),
    prisma.ingestionJob.findMany({
      where: {
        batchId: TARGET_BATCH_ID,
        originalFileName: TARGET_ORIGINAL_FILE,
        status: "FAILED"
      },
      select: { id: true, materialId: true, incomingRelativePath: true, lastError: true }
    }),
    prisma.material.findMany({
      where: {
        batchId: TARGET_BATCH_ID,
        materialId: { not: TARGET_MATERIAL_ID }
      },
      select: { materialId: true }
    })
  ]);

  const blockedReasons: string[] = [];
  if (material) {
    if (material.status !== "FAILED") {
      blockedReasons.push(`${TARGET_MATERIAL_ID} status is ${material.status}, expected FAILED.`);
    }
    if (material.batchId !== TARGET_BATCH_ID) {
      blockedReasons.push(`${TARGET_MATERIAL_ID} batchId is ${material.batchId}, expected ${TARGET_BATCH_ID}.`);
    }
    if (material.relativePath !== TARGET_FAILED_FILE_RELATIVE_PATH) {
      blockedReasons.push(`${TARGET_MATERIAL_ID} relativePath is ${material.relativePath}, expected ${TARGET_FAILED_FILE_RELATIVE_PATH}.`);
    }
  }
  if (derivativeCount > 0) {
    blockedReasons.push(`${TARGET_MATERIAL_ID} has ${derivativeCount} DerivativeFile records; script only handles the known no-derivative artifact.`);
  }
  if (aiJobCount > 0) {
    blockedReasons.push(`${TARGET_MATERIAL_ID} has ${aiJobCount} AIAnalysisJob records; script only handles the known no-ai-job artifact.`);
  }

  const metadataFiles = (await exists(resolveStoragePath(TARGET_METADATA_RELATIVE_PATH)))
    ? [TARGET_METADATA_RELATIVE_PATH]
    : [];
  const failedFiles = (await exists(resolveStoragePath(TARGET_FAILED_FILE_RELATIVE_PATH)))
    ? [TARGET_FAILED_FILE_RELATIVE_PATH]
    : [];
  const processingFrames = await findProcessingFrames();

  return {
    backupPath: null,
    materialExists: Boolean(material),
    fileOperationLogIds: logs.map((log) => log.id),
    failedIngestionJobIds: failedJobs.map((job) => job.id),
    keptBatchMaterialIds: keptBatchMaterials.map((item) => item.materialId),
    metadataFiles,
    failedFiles,
    processingFrames,
    blockedReason: blockedReasons.length > 0 ? blockedReasons.join(" ") : undefined
  };
}

function assertWhitelistedFile(relativePath: string) {
  const normalized = toPosix(relativePath);
  const allowed =
    normalized === TARGET_METADATA_RELATIVE_PATH ||
    normalized === TARGET_FAILED_FILE_RELATIVE_PATH ||
    isWhitelistedProcessingFrame(normalized);
  if (!allowed) {
    throw new Error(`Refusing to delete non-whitelisted file: ${relativePath}`);
  }
}

async function deleteWhitelistedFiles(relativePaths: string[]) {
  for (const relativePath of relativePaths) {
    assertWhitelistedFile(relativePath);
    const absolutePath = resolveStoragePath(relativePath);
    await fs.unlink(absolutePath).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    });
  }
}

async function recalculateTargetBatchStatus() {
  const [batch, materials, jobs] = await Promise.all([
    prisma.importBatch.findUnique({ where: { batchId: TARGET_BATCH_ID } }),
    prisma.material.findMany({ where: { batchId: TARGET_BATCH_ID } }),
    prisma.ingestionJob.findMany({ where: { batchId: TARGET_BATCH_ID } })
  ]);
  if (!batch) return null;

  const activeJobs = jobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING").length;
  const succeededJobs = jobs.filter((job) => job.status === "SUCCEEDED").length;
  const failedJobs = jobs.filter((job) => job.status === "FAILED").length;
  const failedMaterials = materials.filter((material) => material.status === "FAILED").length;
  const needsReview = materials.filter((material) => material.status === "NEEDS_REVIEW").length;
  const imported = materials.filter((material) => material.status === "READY" || material.status === "IMPORTED").length;
  const missingFiles = Math.max(0, batch.fileCount - Math.max(jobs.length, materials.length));
  const hasSuccessfulOutcome = succeededJobs > 0 || imported > 0 || needsReview > 0;
  const allJobsFailed = jobs.length > 0 && failedJobs === jobs.length && !hasSuccessfulOutcome;
  const allMaterialsFailed = materials.length > 0 && failedMaterials === materials.length && !hasSuccessfulOutcome;

  const nextStatus =
    activeJobs > 0
      ? "PROCESSING"
      : allJobsFailed
        ? "FAILED"
        : allMaterialsFailed
          ? "FAILED"
          : failedJobs > 0 || failedMaterials > 0 || missingFiles > 0
            ? "PARTIAL_FAILED"
            : needsReview > 0
              ? "NEEDS_REVIEW"
              : jobs.length > 0 && succeededJobs === jobs.length
                ? "IMPORTED"
                : materials.length > 0 && imported === materials.length
                  ? "IMPORTED"
                  : "PROCESSING";

  await prisma.importBatch.update({
    where: { batchId: TARGET_BATCH_ID },
    data: { status: nextStatus }
  });
  return nextStatus;
}

async function executeCleanup(plan: CleanupPlan) {
  if (plan.blockedReason) {
    throw new Error(plan.blockedReason);
  }

  const backupPath = await backupDatabase();
  const filesToDelete = [
    ...plan.metadataFiles,
    ...plan.failedFiles,
    ...plan.processingFrames
  ];
  await deleteWhitelistedFiles(filesToDelete);

  await prisma.$transaction(async (tx) => {
    if (plan.fileOperationLogIds.length > 0) {
      await tx.fileOperationLog.deleteMany({
        where: { id: { in: plan.fileOperationLogIds } }
      });
    }
    if (plan.materialExists) {
      await tx.material.delete({ where: { materialId: TARGET_MATERIAL_ID } });
    }
    if (plan.failedIngestionJobIds.length > 0) {
      await tx.ingestionJob.deleteMany({
        where: { id: { in: plan.failedIngestionJobIds } }
      });
    }
  });

  const batchStatus = await recalculateTargetBatchStatus();
  return { backupPath, batchStatus };
}

async function printPlan(plan: CleanupPlan, mode: "dry-run" | "execute", execution?: { backupPath: string; batchStatus: string | null }) {
  console.log(`Mode: ${mode}`);
  if (execution?.backupPath) console.log(`Backup: ${execution.backupPath}`);
  if (plan.blockedReason) console.log(`Blocked: ${plan.blockedReason}`);
  console.log(`Target material exists: ${plan.materialExists ? "yes" : "no"}`);
  console.log(`FileOperationLog rows: ${plan.fileOperationLogIds.length}`);
  console.log(`Failed IngestionJob rows: ${plan.failedIngestionJobIds.length}`);
  console.log(`Kept batch materials: ${plan.keptBatchMaterialIds.length > 0 ? plan.keptBatchMaterialIds.join(", ") : "none"}`);
  console.log(`Metadata files: ${plan.metadataFiles.length}`);
  for (const item of plan.metadataFiles) console.log(`  - ${item}`);
  console.log(`Failed source files: ${plan.failedFiles.length}`);
  for (const item of plan.failedFiles) console.log(`  - ${item}`);
  console.log(`Processing frame files: ${plan.processingFrames.length}`);
  for (const item of plan.processingFrames) console.log(`  - ${item}`);
  if (execution?.batchStatus) console.log(`Recalculated batch status: ${execution.batchStatus}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const execute = args.has("--execute");
  const confirmIndex = process.argv.indexOf("--confirm");
  const confirmValue = confirmIndex >= 0 ? process.argv[confirmIndex + 1] : "";
  const plan = await buildCleanupPlan();

  if (!execute) {
    await printPlan(plan, "dry-run");
    return;
  }
  if (confirmValue !== CONFIRM_PHRASE) {
    throw new Error(`Real cleanup requires --confirm ${CONFIRM_PHRASE}.`);
  }

  const execution = await executeCleanup(plan);
  await printPlan(plan, "execute", execution);

  const postPlan = await buildCleanupPlan();
  console.log("Post-check:");
  console.log(`  Target material exists: ${postPlan.materialExists ? "yes" : "no"}`);
  console.log(`  FileOperationLog rows: ${postPlan.fileOperationLogIds.length}`);
  console.log(`  Failed IngestionJob rows: ${postPlan.failedIngestionJobIds.length}`);
  console.log(`  Metadata files: ${postPlan.metadataFiles.length}`);
  console.log(`  Failed source files: ${postPlan.failedFiles.length}`);
  console.log(`  Processing frame files: ${postPlan.processingFrames.length}`);
}

main()
  .catch((error) => {
    console.error("Failed to clean e2e artifacts.");
    console.error((error as Error).message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

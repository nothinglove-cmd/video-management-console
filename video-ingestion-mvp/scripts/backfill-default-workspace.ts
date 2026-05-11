import fs from "node:fs/promises";
import path from "node:path";

import { backfillDefaultWorkspace } from "../lib/workspace/default-workspace.service";
import { prisma } from "../lib/prisma";

function timestampForBackup() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

async function backupDatabase() {
  const source = path.join(process.cwd(), "prisma", "dev.db");
  const backupBase = path.join(
    process.cwd(),
    "prisma",
    `dev.db.v1-02b-backup-${timestampForBackup()}`
  );
  let target = backupBase;
  let suffix = 2;
  while (true) {
    try {
      await fs.access(target);
      target = `${backupBase}-${suffix}`;
      suffix += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  await fs.copyFile(source, target);
  return target;
}

function printCount(label: string, count: number) {
  console.log(`${label}: ${count}`);
}

async function main() {
  const backupPath = await backupDatabase();
  const result = await backfillDefaultWorkspace();

  console.log("Default workspace backfill completed.");
  console.log(`Backup: ${backupPath}`);
  console.log(`Workspace: ${result.workspace.code} (${result.workspace.id})`);
  console.log(`StorageProvider: ${result.storageProvider.code} (${result.storageProvider.id})`);
  printCount("Category.workspaceId", result.counts.categoryWorkspace);
  printCount("Material.workspaceId", result.counts.materialWorkspace);
  printCount("ImportBatch.workspaceId", result.counts.importBatchWorkspace);
  printCount("IngestionJob.workspaceId", result.counts.ingestionJobWorkspace);
  printCount("Shooter.workspaceId", result.counts.shooterWorkspace);
  printCount("DerivativeFile.workspaceId", result.counts.derivativeFileWorkspace);
  printCount("AIAnalysisJob.workspaceId", result.counts.aiAnalysisJobWorkspace);
  printCount("Category.storageProviderId", result.counts.categoryStorageProvider);
  printCount("Material.storageProviderId", result.counts.materialStorageProvider);
  printCount("DerivativeFile.storageProviderId", result.counts.derivativeFileStorageProvider);
}

main()
  .catch((error) => {
    console.error("Failed to backfill default workspace.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

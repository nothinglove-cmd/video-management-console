import fs from "node:fs/promises";
import path from "node:path";

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

async function main() {
  const source = path.join(process.cwd(), "prisma", "dev.db");
  if (!(await exists(source))) {
    throw new Error("prisma/dev.db does not exist. Nothing to back up.");
  }

  const backupBase = path.join(process.cwd(), "prisma", `dev.db.backup-${timestampForBackup()}`);
  let target = backupBase;
  let suffix = 2;
  while (await exists(target)) {
    target = `${backupBase}-${suffix}`;
    suffix += 1;
  }

  await fs.copyFile(source, target);
  console.log(`Backup created: ${target}`);
}

main().catch((error) => {
  console.error("Failed to back up prisma/dev.db.");
  console.error((error as Error).message);
  process.exitCode = 1;
});

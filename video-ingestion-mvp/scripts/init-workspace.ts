import { ensureDefaultWorkspace } from "../lib/workspace/default-workspace.service";
import { ensureBootstrapSuperAdmin } from "../lib/auth/bootstrap-admin";
import { prisma } from "../lib/prisma";

async function main() {
  const result = await ensureDefaultWorkspace();

  console.log("Default workspace initialized.");
  console.log(`Workspace: ${result.workspace.code} (${result.workspace.id})`);
  console.log(`StorageProvider: ${result.storageProvider.code} (${result.storageProvider.id})`);
  console.log(`ThemePreset: ${result.themePreset.code} (${result.themePreset.id})`);
  console.log(`MenuConfig: ${result.menuConfig.code} (${result.menuConfig.id})`);
  console.log(`TerminologyPack: ${result.terminologyPack.code} (${result.terminologyPack.id})`);
  console.log(`IndustryTemplate: ${result.industryTemplate.code} (${result.industryTemplate.id})`);
  console.log(`STORAGE_ROOT: ${result.storageRoot}`);

  const admin = await ensureBootstrapSuperAdmin();
  if (admin.created) {
    console.log("Initial SUPER_ADMIN created.");
    console.log(`Username: ${admin.username}`);
    console.log(`Password: ${admin.password}`);
    console.log("Please save this password and change it after first login.");
  } else {
    console.log(`SUPER_ADMIN already exists: ${admin.username}`);
  }
}

main()
  .catch((error) => {
    console.error("Failed to initialize default workspace.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

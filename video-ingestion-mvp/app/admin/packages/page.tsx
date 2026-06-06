import { MaterialPackageWorkbench } from "@/components/admin/material-package-workbench";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function MaterialPackagesPage() {
  await requirePageRole("ADMIN");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Material Packages"
        title="精选包"
        description="把素材库临时多选升级为可长期管理、可导出、可追踪使用记录的剪辑交付包。"
      />
      <MaterialPackageWorkbench />
    </AppShell>
  );
}

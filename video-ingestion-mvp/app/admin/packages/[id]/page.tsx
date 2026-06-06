import { MaterialPackageWorkbench } from "@/components/admin/material-package-workbench";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function MaterialPackageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("ADMIN");
  const { id } = await params;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Material Package"
        title="精选包详情"
        description="查看包内素材、导出清单、下载原文件或预览文件，并维护素材使用记录。"
      />
      <MaterialPackageWorkbench initialPackageId={id} />
    </AppShell>
  );
}

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ImportBatchCenter } from "@/components/admin/import-batch-center";
import { requirePageRole } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function ImportBatchesPage() {
  await requirePageRole("ADMIN");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Import Batches"
        title="批次中心"
        description="集中查看网页上传、设备导入和后台入库队列的批次进度、失败原因与重试状态。"
      />
      <ImportBatchCenter />
    </AppShell>
  );
}

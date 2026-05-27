import { DeviceImportClient } from "@/components/admin/device-import-client";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export default async function DeviceImportPage() {
  await requirePageRole("ADMIN");
  return (
    <AppShell>
      <PageHeader
        eyebrow="Large File Import"
        title="大文件 / 直播录屏导入"
        description="10GB+ 原片、50GB+ 直播录屏和 NAS 素材优先走本地目录导入，避免浏览器长时间上传。"
      />
      <DeviceImportClient />
    </AppShell>
  );
}

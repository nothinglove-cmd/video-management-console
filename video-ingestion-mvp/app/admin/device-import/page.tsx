import { DeviceImportClient } from "@/components/admin/device-import-client";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function DeviceImportPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Device Import"
        title="设备导入"
        description="从设备拷贝目录扫描带 _READY.txt 的素材文件夹，并进入同一条 AI 入库管道。"
      />
      <DeviceImportClient />
    </AppShell>
  );
}

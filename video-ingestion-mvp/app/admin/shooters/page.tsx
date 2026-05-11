import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { ShooterAdmin } from "@/components/admin/shooter-admin";

export const dynamic = "force-dynamic";

export default function ShootersPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Shooters"
        title="拍摄人管理"
        description="维护上传页可选的拍摄人员。停用或删除不会影响已经入库的历史素材。"
      />
      <ShooterAdmin />
    </AppShell>
  );
}

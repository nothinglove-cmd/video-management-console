import { Database } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { CategoryDirectorySyncPanel } from "@/components/settings/category-directory-sync-panel";
import { RepairPanel } from "@/components/settings/repair-panel";
import { InfoCard, SectionPanel, SettingsBackLink } from "@/components/settings/settings-page-parts";
import { StorageRootPanel } from "@/components/settings/storage-root-panel";
import { WorkspaceStatusPanel } from "@/components/settings/workspace-status-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { getNetworkAccessInfo } from "@/lib/network/access-info";
import { getStorageRootStatus } from "@/lib/storage/storage-root-config.service";

export const dynamic = "force-dynamic";

export default async function StorageSettingsPage() {
  const storageRootStatus = await getStorageRootStatus();
  const accessInfo = getNetworkAccessInfo();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings / Storage"
        title="存储与巡检"
        description="管理 workspace 绑定、存储根目录、栏目目录同步和存储健康巡检；低风险修复不会删除或移动真实素材。"
      />
      <div className="mt-4 space-y-4">
        <SettingsBackLink />
        <SectionPanel
          title="存储状态"
          description="存储根目录切换只更新配置和 absolutePath，不移动或复制文件。"
          action={<StatusPill tone="warning">谨慎写入区</StatusPill>}
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="STORAGE_ROOT" value={storageRootStatus.rootPath} icon={Database} />
            <InfoCard label="来源" value={storageRootStatus.source === "db" ? "后台保存配置" : ".env STORAGE_ROOT"} />
            <InfoCard label="本机后台" value={accessInfo.localhostUrl} />
            <InfoCard label="局域网 / 热点访问" value={accessInfo.addresses[0]?.url || "未检测到可用局域网 IP"} />
          </div>
          <WorkspaceStatusPanel />
          <StorageRootPanel />
          <CategoryDirectorySyncPanel />
          <RepairPanel />
        </SectionPanel>
      </div>
    </AppShell>
  );
}

import { AlertTriangle } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SectionPanel, SettingsBackLink } from "@/components/settings/settings-page-parts";
import { SystemResetPanel } from "@/components/settings/system-reset-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { requirePageRole } from "@/lib/auth/page-guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MaintenanceSettingsPage() {
  await requirePageRole("SUPER_ADMIN");
  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings / Maintenance"
        title="系统维护"
        description="集中放置高风险维护动作。系统完全初始化只清空数据库并重建默认配置；不删除、不移动、不复制 storage root 中的物理文件。"
      />
      <div className="mt-4 space-y-4">
        <SettingsBackLink />
        <SectionPanel
          title="高风险维护"
          description="执行前必须确认 SQLite 和 STORAGE_ROOT 备份状态。高风险能力不出现在总览、存储巡检或环境页面。"
          action={<StatusPill tone="danger">高风险</StatusPill>}
        >
          <Surface tone="muted" padding="sm" className={cn("border-red-200 bg-red-50/80 text-red-900", skin.typography.bodyDense)}>
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                系统完全初始化需要确认短语，只清理数据库和配置表，不会删除、移动或复制 `STORAGE_ROOT` 中的真实素材文件。
              </p>
            </div>
          </Surface>
          <SystemResetPanel />
        </SectionPanel>
      </div>
    </AppShell>
  );
}

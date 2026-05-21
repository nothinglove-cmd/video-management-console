import { Palette } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AdminLinkCard, InfoCard, SectionPanel, SettingsBackLink } from "@/components/settings/settings-page-parts";
import { ThemeSkinPanel } from "@/components/settings/theme-skin-panel";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function InterfaceSettingsPage() {
  const config = getRuntimeAppConfig();
  const activeSkin = config.themeSkins.options.find((option) => option.code === config.themeSkins.activeCode);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings / Interface"
        title="界面与基础配置"
        description="管理当前皮肤、栏目配置入口、拍摄人入口和上层中台字段预留。"
      />
      <div className="mt-4 space-y-4">
        <SettingsBackLink />
        <SectionPanel
          title="界面配置"
          description="主题和基础管理是日常配置，不和高风险维护动作混在一起。"
          action={<StatusPill tone="neutral">{activeSkin?.name || config.theme.name}</StatusPill>}
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="当前皮肤" value={`${activeSkin?.name || config.theme.name} / ${config.themeSkins.activeCode}`} icon={Palette} />
          </div>
          <ThemeSkinPanel />
          <div className="grid gap-3 md:grid-cols-3">
            <AdminLinkCard
              title="栏目配置"
              description="真实目录与逻辑栏目映射；题材、专题、热点优先走标签和搜索。"
              href="/admin/categories"
              cta="进入栏目管理"
            />
            <AdminLinkCard
              title="拍摄人"
              description="素材来源字段管理，不作为系统登录账号或安全边界。"
              href="/admin/shooters"
              cta="进入拍摄人管理"
            />
            <Surface tone="muted" padding="sm" className={cn("space-y-2 text-muted-foreground", skin.typography.bodyDense)}>
              <div>
                <p className={skin.typography.sectionTitle}>上层中台预留</p>
                <p className={cn("mt-1", skin.typography.meta)}>第一版只保留字段边界</p>
              </div>
              <p>预留 operatorId / tenantId / workspaceId / projectId / accountId / productId；当前“本地管理员”只用于操作日志。</p>
            </Surface>
          </div>
        </SectionPanel>
      </div>
    </AppShell>
  );
}

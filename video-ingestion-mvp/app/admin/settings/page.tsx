import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AiProviderConfigPanel } from "@/components/settings/ai-provider-config-panel";
import { CategoryDirectorySyncPanel } from "@/components/settings/category-directory-sync-panel";
import { RepairPanel } from "@/components/settings/repair-panel";
import { StorageRootPanel } from "@/components/settings/storage-root-panel";
import { SystemResetPanel } from "@/components/settings/system-reset-panel";
import { ThemeSkinPanel } from "@/components/settings/theme-skin-panel";
import { WorkspaceStatusPanel } from "@/components/settings/workspace-status-panel";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { ensureDefaultCategories } from "@/lib/categories/category.service";
import { getNetworkAccessInfo } from "@/lib/network/access-info";
import { prisma } from "@/lib/prisma";
import { getStorageRootStatus } from "@/lib/storage/storage-root-config.service";
import type { LucideIcon } from "lucide-react";
import { Database, FolderTree, Palette, SearchCheck, Settings2, ShieldCheck, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ai = await aiProviderConfigService.getPublicResolvedConfig();
  const accessInfo = getNetworkAccessInfo();
  const config = getRuntimeAppConfig();
  const activeSkin = config.themeSkins.options.find((option) => option.code === config.themeSkins.activeCode);
  const storageRootStatus = await getStorageRootStatus();
  const storageRoot = storageRootStatus.rootPath;
  await ensureDefaultCategories();
  const [materialCount, categoryCount, shooterCount, missingSearchCount] = await Promise.all([
    prisma.material.count(),
    prisma.category.count({ where: { NOT: { status: "DELETED" } } }).catch(() => 0),
    prisma.shooter.count({ where: { NOT: { status: "DELETED" } } }),
    prisma.material.count({ where: { OR: [{ searchText: null }, { searchText: "" }] } })
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="系统管理"
        description="本模块不做完整中台账号权限，只管理本地入库所需配置、搜索索引、栏目和存储健康。"
      />
      <div className="mt-4 space-y-4">
        <SectionPanel
          title="系统概览"
          description="把高频状态收拢到一屏内，便于快速判断数据、存储、皮肤和 AI 当前状态。"
          action={<StatusPill tone="neutral">只读摘要</StatusPill>}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="素材记录" value={materialCount} icon={Database} />
            <MetricCard label="栏目配置" value={categoryCount} icon={FolderTree} />
            <MetricCard label="拍摄人" value={shooterCount} icon={Users} />
            <MetricCard label="待补搜索索引" value={missingSearchCount} icon={SearchCheck} tone={missingSearchCount > 0 ? "warning" : "success"} />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            <Info label="Workspace" value="单 workspace" icon={Settings2} />
            <Info label="Storage Root" value={storageRoot} icon={Database} />
            <Info label="当前皮肤" value={`${activeSkin?.name || config.theme.name} / ${config.themeSkins.activeCode}`} icon={Palette} />
            <Info label="AI Provider" value={`${ai.provider} / ${ai.model || "未配置 model"}`} icon={Sparkles} />
            <Info label="巡检入口" value="下方存储与巡检" icon={ShieldCheck} />
          </div>
        </SectionPanel>

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.9fr)] xl:items-start">
          <div className="space-y-4">
            <SectionPanel title="界面与显示" description="当前皮肤、可用皮肤和后续切换能力集中展示。">
              <ThemeSkinPanel />
            </SectionPanel>

            <SectionPanel title="基础管理入口" description="低频配置改为紧凑入口，不再占用大段说明空间。">
              <div className="grid gap-3 md:grid-cols-3">
                <AdminLink
                  title="栏目配置"
                  description="真实目录与逻辑栏目映射；题材、专题、热点优先走标签和搜索。"
                  href="/admin/categories"
                  cta="进入栏目管理"
                />
                <AdminLink
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

            <SectionPanel
              title="存储与巡检"
              description="本机路径、访问地址、workspace 绑定状态和 repair scan / safe fix 操作集中在同一组。"
              action={<StatusPill tone="warning">谨慎操作区</StatusPill>}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="STORAGE_ROOT" value={storageRoot} />
                <Info label="DATABASE_URL" value={process.env.DATABASE_URL || "file:./dev.db"} />
                <Info label="本机访问" value={accessInfo.localhostUrl} />
                <Info label="局域网 / 热点访问" value={accessInfo.addresses[0]?.url || "未检测到可用局域网 IP"} />
              </div>
              <WorkspaceStatusPanel />
              <StorageRootPanel />
              <CategoryDirectorySyncPanel />
              <RepairPanel />
            </SectionPanel>
          </div>

          <div className="space-y-4">
            <SectionPanel
              title="AI 与识别"
              description="压缩展示 provider、模型、baseUrl、fallback 和连接测试入口。"
              action={<StatusPill tone={ai.provider === "mock" ? "neutral" : "info"}>{ai.provider}</StatusPill>}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="Provider / Model" value={`${ai.provider} / ${ai.model || "-"}`} />
                <Info label="Fallback" value={ai.fallbackProvider} />
                <Info label="Base URL" value={ai.baseUrl || ai.volcengineBaseUrl || "未配置"} />
                <Info label="Local AI" value={`${ai.localBaseUrl || "未配置"} / ${ai.localModel || "未配置"}`} />
                <Info label="配置来源" value={ai.source === "db" ? "后台保存配置" : ".env 配置"} />
                <Info label="Key 状态" value={`OpenAI ${ai.openaiApiKeyConfigured ? "已配置" : "未配置"} / Ark ${ai.arkApiKeyConfigured ? "已配置" : "未配置"} / Local ${ai.localApiKeyConfigured ? "已配置" : "未配置"}`} />
                <Info label="请求参数" value={`${ai.frameMax} 张 / ${ai.imageDetail} / ${ai.requestTimeoutMs}ms`} />
                <Info label="Local Healthcheck" value={ai.localHealthcheckUrl || "未配置"} />
              </div>
              <AiProviderConfigPanel />
            </SectionPanel>

            <SectionPanel
              title="系统维护"
              description="系统完全初始化只清空数据库并重建默认配置；不删除、不移动、不复制 storage root 中的物理文件。"
              action={<StatusPill tone="warning">高风险维护</StatusPill>}
            >
              <SystemResetPanel />
            </SectionPanel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionPanel({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={skin.typography.sectionTitle}>{title}</p>
          <p className={cn("mt-1", skin.typography.meta)}>{description}</p>
        </div>
        {action}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function AdminLink({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
  return (
    <Surface tone="muted" padding="sm" className={cn("flex min-w-0 flex-col gap-3", skin.typography.bodyDense)}>
      <div className="min-w-0">
        <p className={skin.typography.sectionTitle}>{title}</p>
        <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{description}</p>
      </div>
      <Button asChild variant="secondary" className="min-h-10 w-fit">
        <Link href={href}>{cta}</Link>
      </Button>
    </Surface>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <div className="flex items-start gap-2">
        {Icon ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className={skin.typography.label}>{label}</p>
          <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{value}</p>
        </div>
      </div>
    </Surface>
  );
}

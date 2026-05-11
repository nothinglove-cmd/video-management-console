import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  FolderKanban,
  FolderTree,
  Home,
  MonitorUp,
  Recycle,
  Settings,
  Smartphone,
  UploadCloud,
  Users,
  WandSparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { MaterialTable } from "@/components/materials/material-table";
import { AccessInfoCard } from "@/components/dashboard/access-info-card";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import type { AppMenuIconKey } from "@/lib/app-config/default-menu";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { getNetworkAccessInfo } from "@/lib/network/access-info";
import { prisma } from "@/lib/prisma";
import { storageService } from "@/lib/storage/storage.service";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const { terminology: terms } = getRuntimeAppConfig();

const iconMap = {
  archive: Archive,
  folderKanban: FolderKanban,
  folderTree: FolderTree,
  home: Home,
  monitorUp: MonitorUp,
  recycle: Recycle,
  settings: Settings,
  smartphone: Smartphone,
  uploadCloud: UploadCloud,
  users: Users
} satisfies Record<AppMenuIconKey, LucideIcon>;

export default async function AdminDashboardPage() {
  await storageService.initializeStorage();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const accessInfo = getNetworkAccessInfo();
  const { menu } = getRuntimeAppConfig();

  const [
    todayUploads,
    processing,
    needsReview,
    ready,
    lowConfidence,
    failed,
    trashed,
    recentMaterials
  ] = await Promise.all([
    prisma.material.count({ where: { createdAt: { gte: today } } }),
    prisma.material.count({ where: { status: { in: ["UPLOADED", "PROCESSING", "AI_TAGGED"] } } }),
    prisma.material.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.material.count({ where: { status: { in: ["READY", "IMPORTED"] } } }),
    prisma.material.count({ where: { aiConfidence: { lt: 0.6 }, NOT: { status: "TRASHED" } } }),
    prisma.material.count({ where: { status: "FAILED" } }),
    prisma.material.count({ where: { status: "TRASHED" } }),
    prisma.material.findMany({
      where: { NOT: { status: "TRASHED" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { operationLogs: { orderBy: { createdAt: "desc" }, take: 3 } }
    })
  ]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Dashboard"
        title="工作台"
        description={`视频${terms.material.plural}${terms.ingestion.noun}总览、待处理事项和${terms.material.recent}。`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href="/upload">{terms.upload.desktop}</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/ingest-review">处理{terms.ingestion.queue}</Link>
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <MetricCard label={`今日${terms.upload.noun}`} value={todayUploads} icon={UploadCloud} tone="info" />
        <MetricCard label="待 AI 识别" value={processing} icon={WandSparkles} tone="processing" />
        <MetricCard label="待人工确认" value={needsReview} icon={Clock3} tone="review" />
        <MetricCard label={`已${terms.ingestion.noun}`} value={ready} icon={CheckCircle2} tone="success" />
        <MetricCard label={`低置信度${terms.material.singular}`} value={lowConfidence} icon={AlertTriangle} tone="warning" />
        <MetricCard label={`失败${terms.material.singular}`} value={failed} icon={Archive} tone="danger" />
        <MetricCard label={terms.trash.noun} value={trashed} icon={Recycle} tone="neutral" />
      </section>

      <section className="mt-4" style={skin.vars}>
        <SectionTitle title="快捷入口" description="常用入库、整理和系统配置入口。" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {menu.dashboardShortcuts.map((item) => {
            const Icon = iconMap[item.iconKey];
            return (
              <Link key={item.href} href={item.href} className={cn(skin.card, "group block p-3 lg:p-4")}>
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--skin-radius-control)] bg-[color:var(--skin-surface-selected)] text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <p className={cn("mt-3", skin.typography.cardTitle)}>{item.label}</p>
                <p className={cn("mt-1", skin.typography.meta)}>{item.dashboardDescription}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-4 grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_var(--skin-dashboard-aside-width)]">
        <Panel padding="none" className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)]">
            <div>
              <h2 className={skin.typography.panelTitle}>{terms.material.recent}</h2>
              <p className={cn("mt-1", skin.typography.meta)}>最近进入系统的{terms.material.plural}和处理状态。</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/ingest-review">查看全部</Link>
            </Button>
          </div>
          <div className="p-[var(--skin-panel-padding)]">
            <div className="thin-scrollbar max-w-full overflow-auto">
              <MaterialTable materials={recentMaterials as never} />
            </div>
          </div>
        </Panel>

        <Panel className={cn("space-y-3", skin.typography.body)}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className={skin.typography.panelTitle}>系统信息</h2>
              <p className={cn("mt-1", skin.typography.meta)}>本机部署和访问状态。</p>
            </div>
            <StatusPill tone="success" withDot>本地运行</StatusPill>
          </div>
          <div className="space-y-3">
            <InfoLine label="存储根目录" value={storageService.root} />
            <AccessInfoCard info={accessInfo} />
            <InfoLine label="数据库" value="SQLite / prisma/dev.db" />
            <InfoLine label="AI 模式" value={process.env.AI_PROVIDER || "mock"} />
            <InfoLine label="版本" value="v0.1.0" />
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className={skin.typography.sectionTitle}>{title}</h2>
        {description ? <p className={cn("mt-1", skin.typography.meta)}>{description}</p> : null}
      </div>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <Surface tone="muted" padding="sm">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{value}</p>
    </Surface>
  );
}

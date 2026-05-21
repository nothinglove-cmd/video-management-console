import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowLeft, ArrowRight } from "lucide-react";
import Link from "next/link";
import type React from "react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export function SectionPanel({
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

export function InfoCard({ label, value, icon: Icon }: { label: string; value: string; icon?: LucideIcon }) {
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

export function AdminLinkCard({ title, description, href, cta }: { title: string; description: string; href: string; cta: string }) {
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

export function SettingsEntryCard({
  title,
  description,
  href,
  cta = "进入设置",
  tone = "neutral",
  icon: Icon
}: {
  title: string;
  description: string;
  href: string;
  cta?: string;
  tone?: "neutral" | "info" | "warning" | "danger" | "success";
  icon?: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col gap-4 rounded-[var(--skin-radius-panel)] border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] p-[var(--skin-panel-padding)] shadow-[var(--skin-shadow-card)] transition hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--skin-shadow-elevated)]",
        tone === "danger" && "border-red-200 bg-red-50/80 text-red-950",
        tone === "warning" && "border-amber-200 bg-amber-50/60",
        skin.typography.bodyDense
      )}
    >
      <div className="flex items-start gap-2">
        {Icon ? (
          <span
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] bg-primary/10 text-primary",
              tone === "danger" && "bg-red-100 text-red-700",
              tone === "warning" && "bg-amber-100 text-amber-700"
            )}
          >
            <Icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className={cn("text-base font-semibold leading-6", skin.typography.sectionTitle)}>{title}</p>
            <StatusPill tone={tone}>{riskLabel(tone)}</StatusPill>
          </div>
          <p className={cn("mt-2 text-muted-foreground", skin.typography.meta)}>{description}</p>
        </div>
      </div>
      <span
        className={cn(
          "inline-flex min-h-10 w-fit items-center justify-center rounded-[var(--skin-radius-control)] px-3 py-2 font-medium transition",
          tone === "danger"
            ? "bg-destructive text-destructive-foreground group-hover:bg-destructive/90"
            : "border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] text-foreground shadow-[var(--skin-shadow-card)] group-hover:bg-[color:var(--skin-surface-hover)]",
          skin.typography.button
        )}
      >
        {cta}
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </span>
    </Link>
  );
}

export function SettingsBackLink() {
  return (
    <Button asChild variant="secondary" className="min-h-10 w-fit">
      <Link href="/admin/settings">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        返回设置中心
      </Link>
    </Button>
  );
}

export function RiskLegend({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Surface tone="muted" padding="sm" className="flex flex-wrap items-center gap-2">
        <span className={cn("mr-1 font-medium", skin.typography.meta)}>操作风险</span>
        <CompactRisk tone="neutral" label="只读动作" description="不写数据库或文件" />
        <CompactRisk tone="warning" label="会写入动作" description="保存配置或生成说明文件" />
        <CompactRisk tone="danger" label="高风险维护" description="只放在系统维护页" />
      </Surface>
    );
  }

  return (
    <Surface tone="muted" padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={skin.typography.sectionTitle}>操作风险说明</p>
          <p className={cn("mt-1", skin.typography.meta)}>设置中心按影响范围分层；进入子页面后再执行具体操作。</p>
        </div>
        <StatusPill tone="info" withDot>分层提示</StatusPill>
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        <RiskItem
          tone="neutral"
          title="只读动作"
          description="刷新状态、扫描健康状态、检查路径、测试连接和导出诊断报告；不写数据库，不写文件。"
        />
        <RiskItem
          tone="warning"
          title="会写入动作"
          description="保存配置、同步栏目目录、重建索引、写素材说明文件或执行低风险修复；会说明写入范围。"
        />
        <RiskItem
          tone="danger"
          title="高风险维护"
          description="清理数据库或改变核心配置；只放在系统维护页，并通过确认短语或明确二次确认执行。"
        />
      </div>
    </Surface>
  );
}

function CompactRisk({ tone, label, description }: { tone: "neutral" | "warning" | "danger"; label: string; description: string }) {
  return (
    <span className={cn("inline-flex min-h-8 items-center gap-2 rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border-muted)] bg-white/60 px-2.5", skin.typography.meta)}>
      <StatusPill tone={tone}>{label}</StatusPill>
      <span className="text-muted-foreground">{description}</span>
    </span>
  );
}

function RiskItem({ tone, title, description }: { tone: "neutral" | "warning" | "danger"; title: string; description: string }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        {tone === "danger" ? <AlertTriangle className="h-4 w-4 text-red-600" /> : null}
        <StatusPill tone={tone}>{title}</StatusPill>
      </div>
      <p className={cn("text-muted-foreground", skin.typography.meta)}>{description}</p>
    </Surface>
  );
}

function riskLabel(tone: "neutral" | "info" | "warning" | "danger" | "success") {
  if (tone === "danger") return "高风险";
  if (tone === "warning") return "会写入";
  if (tone === "success") return "已配置";
  if (tone === "info") return "配置";
  return "只读";
}

"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Database, FileJson, ImagePlus, RefreshCcw, SearchCheck } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import type { StorageAuditIssueGroup } from "@/lib/repair/storage-audit.types";

type RepairIssue = {
  id: string;
  group?: StorageAuditIssueGroup;
  type: string;
  severity: "info" | "warning" | "error";
  safeFixable?: boolean;
  fixAction?: string;
  materialId?: string;
  fileName?: string;
  relativePath?: string;
  message: string;
  details?: Record<string, unknown>;
};

type FixResult = {
  fixed: Array<{ issueId: string; type?: string; message: string }>;
  skipped: Array<{ issueId: string; type?: string; message: string }>;
  failed: Array<{ issueId: string; type?: string; message: string }>;
  message: string;
};

type RepairReport = {
  scannedAt: string;
  storageRoot: string;
  counts: {
    materials: number;
    mediaFiles: number;
    metadataFiles: number;
    derivativeFiles?: number;
    categories?: number;
    ingestionJobs?: number;
    aiAnalysisJobs?: number;
    issues: number;
    totalIssues?: number;
    errorCount?: number;
    warningCount?: number;
    infoCount?: number;
    safeFixableCount?: number;
    byGroup?: Partial<Record<StorageAuditIssueGroup, number>>;
  };
  issues: RepairIssue[];
};

const GROUPS: StorageAuditIssueGroup[] = [
  "MATERIAL_FILE",
  "METADATA_JSON",
  "DERIVATIVE_FILE",
  "AI_FRAME_INPUT",
  "PROCESSING_TEMP_FILE",
  "CATEGORY_DIRECTORY",
  "INGESTION_JOB_SOURCE"
];

const GROUP_LABELS: Record<StorageAuditIssueGroup, string> = {
  MATERIAL_FILE: "素材主文件",
  METADATA_JSON: "metadata JSON",
  DERIVATIVE_FILE: "派生文件",
  AI_FRAME_INPUT: "AI 输入帧",
  PROCESSING_TEMP_FILE: "处理中临时文件",
  CATEGORY_DIRECTORY: "栏目目录",
  INGESTION_JOB_SOURCE: "入库源文件"
};

export function RepairPanel() {
  const [report, setReport] = useState<RepairReport | null>(null);
  const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  async function post(path: string, success: (data: any) => string, body?: unknown) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage(data.error || "操作失败。");
      return;
    }
    if (path.endsWith("/scan")) {
      setReport(data);
      setSelectedIssueIds([]);
    }
    setMessage(success(data));
  }

  async function runSafeFix() {
    if (selectedIssueIds.length === 0) {
      setMessage("请先选择可安全修复的问题。");
      return;
    }
    const confirmed = window.confirm(
      `将安全修复 ${selectedIssueIds.length} 个问题。\n\n本操作只会写 metadata/.category.json 或更新可推导的数据库字段，不会删除、移动或导入真实素材。是否继续？`
    );
    if (!confirmed) return;

    setBusy("/api/admin/repair/fix-safe");
    setMessage("");
    setFixResult(null);
    const response = await fetch("/api/admin/repair/fix-safe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueIds: selectedIssueIds })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setBusy("");
      setMessage(data.error || "安全修复失败。");
      return;
    }
    setFixResult(data);
    setMessage(data.message || "安全修复完成。");

    const scanResponse = await fetch("/api/admin/repair/scan", { method: "POST" });
    const scanData = await scanResponse.json().catch(() => null);
    if (scanResponse.ok && scanData) {
      setReport(scanData);
      setSelectedIssueIds([]);
    }
    setBusy("");
  }

  function toggleIssue(issueId: string) {
    setSelectedIssueIds((current) =>
      current.includes(issueId)
        ? current.filter((id) => id !== issueId)
        : [...current, issueId]
    );
  }

  function selectAllSafeFixable() {
    const ids = report?.issues.filter((issue) => issue.safeFixable).map((issue) => issue.id) ?? [];
    setSelectedIssueIds(ids);
  }

  return (
    <Panel padding="none" className="overflow-hidden" style={skin.vars}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>系统修复</p>
          <p className={cn("mt-1", skin.typography.meta)}>扫描、索引重建和低风险修复状态</p>
        </div>
        <StatusPill tone="warning" withDot>谨慎操作</StatusPill>
      </div>
      <div className="space-y-3 p-[var(--skin-panel-padding)]">
        <Surface tone="muted" padding="sm" className={cn("flex flex-col gap-1 border-amber-200 bg-amber-50/70 text-amber-900 sm:flex-row sm:items-start sm:gap-3", skin.typography.body)}>
          <div className="flex shrink-0 items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> 安全原则
          </div>
          <p className={cn("min-w-0", skin.typography.meta)}>
            扫描只生成报告，不会自动移动文件、删除文件或修改数据库。修复按钮仍只做原有可逆或可重建动作：重建搜索索引、重建素材说明文件、从说明文件恢复缺失素材记录。
          </p>
        </Surface>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <RepairAction
            icon={SearchCheck}
            label="扫描健康状态"
            description="只生成报告，不修改数据库或文件。"
            disabled={Boolean(busy)}
            onClick={() => post("/api/admin/repair/scan", () => "扫描完成。")}
          />
          <RepairAction
            icon={RefreshCcw}
            label="重建搜索索引"
            description="让素材重新可被搜索。"
            disabled={Boolean(busy)}
            onClick={() => post("/api/admin/repair/rebuild-search-index", (data) => `已重建 ${data.updated ?? 0} 条索引。`)}
          />
          <RepairAction
            icon={FileJson}
            label="重建素材说明文件"
            description="根据数据库重新写 metadata JSON。"
            disabled={Boolean(busy)}
            onClick={() => post("/api/admin/repair/rebuild-metadata", (data) => `已写入 ${data.written ?? 0} 个素材说明文件。`)}
          />
          <RepairAction
            icon={ImagePlus}
            label="修复缺失缩略图"
            description="重新生成缺失或失败的缩略图、AI 抽帧和预览。"
            disabled={Boolean(busy)}
            onClick={() => post("/api/admin/repair/regenerate-derivatives", (data) => data.message || `已重新生成 ${data.regenerated ?? 0} 个素材派生文件。`, { limit: 200 })}
          />
          <RepairAction
            icon={Database}
            label="从说明文件恢复素材记录"
            description="从已有 metadata JSON 恢复缺失素材记录。"
            disabled={Boolean(busy)}
            onClick={() => post("/api/admin/repair/rebuild-from-metadata", (data) => `已恢复 ${data.created ?? 0} 条记录，跳过 ${data.skipped ?? 0} 条。`)}
          />
        </div>

        {message ? (
          <Surface tone="muted" padding="sm" className={cn("font-medium", skin.typography.body)}>
            <StatusPill tone={messageTone(message)}>{message}</StatusPill>
          </Surface>
        ) : null}
        {fixResult ? (
          <Surface tone="muted" padding="sm" className={skin.typography.body}>
            <div className="flex flex-wrap gap-2 font-medium">
              <StatusPill tone="success">已修复 {fixResult.fixed.length}</StatusPill>
              <StatusPill tone="neutral">已跳过 {fixResult.skipped.length}</StatusPill>
              <StatusPill tone={fixResult.failed.length > 0 ? "danger" : "neutral"}>失败 {fixResult.failed.length}</StatusPill>
            </div>
            {fixResult.failed.length > 0 ? (
              <div className={cn("mt-2 space-y-1 text-red-700", skin.typography.meta)}>
                {fixResult.failed.slice(0, 5).map((item) => (
                  <p key={item.issueId}>{item.type || item.issueId}：{item.message}</p>
                ))}
              </div>
            ) : null}
          </Surface>
        ) : null}

        {report ? (
          <div className="space-y-3">
            <div className={cn("grid gap-2 sm:grid-cols-3 xl:grid-cols-6", skin.typography.body)}>
              <Metric label="素材记录" value={report.counts.materials} icon={Database} />
              <Metric label="媒体文件" value={report.counts.mediaFiles} icon={Database} />
              <Metric label="metadata" value={report.counts.metadataFiles} icon={FileJson} />
              <Metric label="派生文件" value={report.counts.derivativeFiles ?? 0} icon={FileJson} />
              <Metric label="栏目" value={report.counts.categories ?? 0} icon={Database} />
              <Metric label="入库任务" value={report.counts.ingestionJobs ?? 0} icon={RefreshCcw} />
              <Metric label="AI 记录" value={report.counts.aiAnalysisJobs ?? 0} icon={SearchCheck} />
              <Metric label="问题" value={report.counts.totalIssues ?? report.counts.issues} icon={AlertTriangle} tone={(report.counts.totalIssues ?? report.counts.issues) > 0 ? "warning" : "success"} />
              <Metric label="error" value={report.counts.errorCount ?? 0} icon={AlertTriangle} tone={(report.counts.errorCount ?? 0) > 0 ? "danger" : "neutral"} />
              <Metric label="warning" value={report.counts.warningCount ?? 0} icon={AlertTriangle} tone={(report.counts.warningCount ?? 0) > 0 ? "warning" : "neutral"} />
              <Metric label="info" value={report.counts.infoCount ?? 0} icon={SearchCheck} />
              <Metric label="可安全修复" value={report.counts.safeFixableCount ?? 0} icon={SearchCheck} tone={(report.counts.safeFixableCount ?? 0) > 0 ? "info" : "neutral"} />
            </div>
            <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-3", skin.typography.body)}>
              {GROUPS.map((group) => (
                <Surface key={group} tone="muted" padding="sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className={cn("font-medium", skin.typography.label)}>{GROUP_LABELS[group]}</p>
                    <StatusPill tone={(report.counts.byGroup?.[group] ?? 0) > 0 ? "warning" : "neutral"}>
                      {report.counts.byGroup?.[group] ?? 0}
                    </StatusPill>
                  </div>
                </Surface>
              ))}
            </div>
            {(report.counts.byGroup?.PROCESSING_TEMP_FILE ?? 0) > 0 ? (
              <Surface tone="muted" padding="sm" className={cn("border-amber-200 bg-amber-50/70 text-amber-900", skin.typography.meta)}>
                处理中临时文件通常是历史抽帧残留，不代表素材主文件缺失；如无入库任务运行，可后续通过专门清理入口处理。
              </Surface>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="min-h-10" onClick={selectAllSafeFixable} disabled={Boolean(busy) || (report.counts.safeFixableCount ?? 0) === 0}>
                选择全部可安全修复
              </Button>
              <Button className="min-h-10" onClick={runSafeFix} disabled={Boolean(busy) || selectedIssueIds.length === 0}>
                修复已选择的低风险问题（{selectedIssueIds.length}）
              </Button>
              <p className={cn("basis-full text-muted-foreground sm:basis-auto", skin.typography.meta)}>
                修复低风险问题不会删除或移动真实素材。
              </p>
              {selectedIssueIds.length > 0 ? (
                <Button variant="ghost" className="min-h-10" onClick={() => setSelectedIssueIds([])} disabled={Boolean(busy)}>
                  清空选择
                </Button>
              ) : null}
            </div>
            <div className={cn(skin.table.wrapper, "max-h-[28rem]")}>
              {report.issues.length === 0 ? (
                <div className={cn("p-4 text-muted-foreground", skin.typography.body)}>没有发现明显问题。</div>
              ) : (
                GROUPS.map((group) => {
                  const groupIssues = report.issues.filter((issue) => issue.group === group);
                  if (groupIssues.length === 0) return null;
                  return (
                    <details key={group} className="group border-b last:border-b-0">
                      <summary className={cn("sticky top-0 flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-semibold", skin.table.header)}>
                        <span>{GROUP_LABELS[group]}</span>
                        <StatusPill tone="neutral">{groupIssues.length}</StatusPill>
                      </summary>
                      {groupIssues.slice(0, 80).map((issue, index) => (
                        <div key={`${issue.type}-${issue.relativePath}-${index}`} className={cn("p-3", skin.typography.tableCell, skin.table.row)}>
                          <div className="flex flex-wrap items-center gap-2">
                            {issue.safeFixable ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                checked={selectedIssueIds.includes(issue.id)}
                                onChange={() => toggleIssue(issue.id)}
                                aria-label={`选择 ${issue.type}`}
                              />
                            ) : null}
                            <StatusPill tone={severityTone(issue.severity)}>{issue.severity}</StatusPill>
                            <span className="font-semibold">{issue.type}</span>
                            {issue.safeFixable ? <StatusPill tone="success">safe-fixable</StatusPill> : null}
                            {issue.materialId ? <span className="text-primary">{issue.materialId}</span> : null}
                          </div>
                          <p className="mt-1 text-muted-foreground">{issue.message}</p>
                          {issue.relativePath ? <p className={cn("mt-1 break-all text-slate-500", skin.typography.path)}>{issue.relativePath}</p> : null}
                          {issue.type === "PROCESSING_TEMP_FRAME_LEFTOVER" ? <ProcessingTempFrameDetails details={issue.details} /> : null}
                        </div>
                      ))}
                    </details>
                  );
                })
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function Metric({ label, value, tone = "neutral", icon }: { label: string; value: number; tone?: SkinStatusTone; icon: LucideIcon }) {
  return <MetricCard label={label} value={value} tone={tone} icon={icon} className="p-2" />;
}

function RepairAction({
  icon: Icon,
  label,
  description,
  disabled,
  onClick
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <div className="grid gap-1">
      <Button variant="secondary" className="min-h-10 whitespace-normal text-left" onClick={onClick} disabled={disabled} title={description}>
        <Icon className="mr-2 h-4 w-4 shrink-0" /> {label}
      </Button>
      <p className={cn("px-1 text-muted-foreground", skin.typography.meta)}>{description}</p>
    </div>
  );
}

function severityTone(severity: RepairIssue["severity"]): SkinStatusTone {
  if (severity === "error") return "danger";
  if (severity === "warning") return "warning";
  return "info";
}

function messageTone(message: string): SkinStatusTone {
  if (message.includes("失败") || message.includes("错误")) return "danger";
  if (message.includes("完成") || message.includes("已")) return "success";
  return "info";
}

function ProcessingTempFrameDetails({ details }: { details?: Record<string, unknown> }) {
  const frameCount = typeof details?.frameCount === "number" ? details.frameCount : 0;
  const sampleFiles = Array.isArray(details?.sampleFiles)
    ? details.sampleFiles.filter((item): item is string => typeof item === "string")
    : [];

  if (frameCount === 0 && sampleFiles.length === 0) return null;

  return (
    <Surface tone="muted" padding="sm" className={cn("mt-2 border-amber-100 bg-amber-50/60 text-amber-900", skin.typography.meta)}>
      <p className="font-semibold">临时帧数量：{frameCount}</p>
      {sampleFiles.length > 0 ? (
        <div className="mt-1 space-y-1">
          {sampleFiles.map((item) => (
            <p key={item} className="break-all">{item}</p>
          ))}
        </div>
      ) : null}
    </Surface>
  );
}

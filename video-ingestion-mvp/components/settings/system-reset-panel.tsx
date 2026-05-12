"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, DatabaseBackup, RefreshCcw, ShieldAlert, Trash2 } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

const REQUIRED_CONFIRMATION = "RESET_SYSTEM_KEEP_FILES";

type SystemResetPreview = {
  generatedAt: string;
  requiredConfirmation: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  willDeleteStorageFiles: false;
  sqliteBackup: {
    required: true;
    pattern: string;
  };
  rebuilds: {
    workspaceCode: string;
    storageProviderCode: string;
    themePresetCode: string;
    menuConfigCode: string;
    terminologyPackCode: string;
    industryTemplateCode: string;
    standardDirectoryCount: number;
    defaultCategories: true;
  };
  hasRunningIngestionJob: boolean;
  counts: Record<string, number>;
};

type SystemResetResult = {
  executedAt: string;
  operatorName: string;
  sqliteBackupPath: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  willDeleteStorageFiles: false;
  deletedRecords: Record<string, number>;
  rebuiltDefaults: {
    workspaceCode: string;
    storageProviderCode: string;
    categoryCount: number;
    standardDirectoryCount: number;
  };
};

const BUSINESS_METRICS = [
  ["material", "素材"],
  ["importBatch", "批次"],
  ["ingestionJob", "入库任务"],
  ["derivativeFile", "派生文件"],
  ["aiAnalysisJob", "AI 记录"],
  ["fileOperationLog", "操作日志"],
  ["category", "栏目"],
  ["shooter", "拍摄人"]
] as const;

const CONFIG_METRICS = [
  ["workspace", "Workspace"],
  ["storageProvider", "StorageProvider"],
  ["themePreset", "ThemePreset"],
  ["menuConfig", "MenuConfig"],
  ["terminologyPack", "TerminologyPack"],
  ["industryTemplate", "IndustryTemplate"],
  ["namingTemplate", "NamingTemplate"],
  ["metadataSchema", "MetadataSchema"]
] as const;

export function SystemResetPanel() {
  const [preview, setPreview] = useState<SystemResetPreview | null>(null);
  const [result, setResult] = useState<SystemResetResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [operatorName, setOperatorName] = useState("本地管理员");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const canExecute = useMemo(
    () => confirmation === REQUIRED_CONFIRMATION && !busy && Boolean(preview) && !preview?.hasRunningIngestionJob,
    [busy, confirmation, preview]
  );

  useEffect(() => {
    void loadPreview();
  }, []);

  async function loadPreview() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/system-reset/preview", { method: "GET" });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "读取初始化预览失败。");
      return;
    }
    setPreview(data);
  }

  async function executeReset() {
    const confirmed = window.confirm(
      `将清空业务数据库和配置，并重建默认系统。\n\n不会删除、移动、复制 STORAGE_ROOT 中的任何物理文件。\n\n确认短语：${REQUIRED_CONFIRMATION}\n\n执行前会备份 SQLite。是否继续？`
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    setResult(null);
    const response = await fetch("/api/admin/system-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmation,
        operatorName
      })
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "系统初始化失败。");
      return;
    }
    setResult(data);
    setMessage("系统初始化完成。请刷新页面确认默认配置和目录状态。");
    setConfirmation("");
    await loadPreview();
  }

  return (
    <Panel padding="none" className="overflow-hidden border-amber-200 bg-amber-50/30" style={skin.vars}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-amber-200 px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>系统完全初始化</p>
          <p className={cn("mt-1 text-amber-900/80", skin.typography.meta)}>清空数据库并重建默认系统，不删除物理文件</p>
        </div>
        <StatusPill tone="warning" withDot>高风险维护</StatusPill>
      </div>

      <div className="space-y-3 p-[var(--skin-panel-padding)]">
        <Surface tone="muted" padding="sm" className={cn("border-amber-200 bg-white/80 text-amber-950", skin.typography.body)}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">本操作只清空数据库业务表和配置表，不删除、不移动、不复制 STORAGE_ROOT 中的任何物理文件。</p>
              <p className={skin.typography.meta}>会保留当前有效存储根目录，并在重建默认 Workspace / StorageProvider 后写回该 root；执行前会新增 SQLite 备份。</p>
            </div>
          </div>
        </Surface>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {BUSINESS_METRICS.map(([key, label]) => (
            <MetricCard key={key} label={label} value={preview?.counts[key] ?? 0} icon={Trash2} tone={(preview?.counts[key] ?? 0) > 0 ? "warning" : "neutral"} />
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {CONFIG_METRICS.map(([key, label]) => (
            <Metric key={key} label={label} value={preview?.counts[key] ?? 0} />
          ))}
        </div>

        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
          <Surface tone="muted" padding="sm" className="min-w-0">
            <p className={skin.typography.label}>当前有效 storage root</p>
            <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{preview?.storageRoot || "读取中..."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone="info">来源：{preview?.storageRootSource === "db" ? "后台保存配置" : ".env fallback"}</StatusPill>
              <StatusPill tone={preview?.willDeleteStorageFiles === false ? "success" : "danger"}>不删除物理文件</StatusPill>
              <StatusPill tone={preview?.hasRunningIngestionJob ? "danger" : "success"}>
                {preview?.hasRunningIngestionJob ? "存在 RUNNING 任务" : "无 RUNNING 任务"}
              </StatusPill>
            </div>
          </Surface>
          <Surface tone="muted" padding="sm">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Workspace" value={preview?.rebuilds.workspaceCode ?? "default"} />
              <Metric label="StorageProvider" value={preview?.rebuilds.storageProviderCode ?? "local-default"} />
              <Metric label="标准目录" value={preview?.rebuilds.standardDirectoryCount ?? 0} />
              <Metric label="默认栏目" value={preview?.rebuilds.defaultCategories ? "重建" : "等待预览"} />
            </div>
          </Surface>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <Surface tone="muted" padding="sm" className={skin.typography.bodyDense}>
            <p className="font-semibold">将清空</p>
            <p className="mt-1 text-muted-foreground">业务数据表和配置表记录，包括素材、批次、入库任务、派生文件、AI 记录、拍摄人、栏目、Workspace 和默认配置。</p>
          </Surface>
          <Surface tone="muted" padding="sm" className={skin.typography.bodyDense}>
            <p className="font-semibold">将保留</p>
            <p className="mt-1 text-muted-foreground">当前有效 storage root、STORAGE_ROOT 中所有真实文件和文件夹、项目代码、.env、docs、schema、package 文件和现有备份。</p>
          </Surface>
        </div>

        <Surface tone="muted" padding="sm" className={cn("border-amber-200 bg-amber-50/70 text-amber-950", skin.typography.bodyDense)}>
          <div className="flex items-start gap-2">
            <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0" />
            <p>执行前会备份 SQLite 到 {preview?.sqliteBackup.pattern || "prisma/dev.db.system-reset-backup-YYYYMMDD-HHMMSS"}；如同名存在会追加序号。</p>
          </div>
        </Surface>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.35fr)]">
          <label className="min-w-0 space-y-1">
            <span className={skin.typography.label}>确认短语</span>
            <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={REQUIRED_CONFIRMATION} />
          </label>
          <label className="min-w-0 space-y-1">
            <span className={skin.typography.label}>操作人</span>
            <Input value={operatorName} onChange={(event) => setOperatorName(event.target.value)} placeholder="本地管理员" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="min-h-10" onClick={loadPreview} disabled={busy}>
            <RefreshCcw className="mr-2 h-4 w-4" /> 刷新预览
          </Button>
          <Button variant="destructive" className="min-h-10" onClick={executeReset} disabled={!canExecute}>
            <AlertTriangle className="mr-2 h-4 w-4" /> 清空数据库并重建默认系统（不删除文件）
          </Button>
        </div>

        {message ? (
          <Surface tone="muted" padding="sm" className={skin.typography.body}>
            <StatusPill tone={message.includes("完成") ? "success" : "danger"}>{message}</StatusPill>
          </Surface>
        ) : null}

        {result ? (
          <Surface tone="muted" padding="sm" className={cn("space-y-2", skin.typography.bodyDense)}>
            <p className="font-semibold">执行结果</p>
            <p className="break-all">SQLite 备份：{result.sqliteBackupPath}</p>
            <p className="break-all">保留 storage root：{result.storageRoot}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="物理文件删除" value={result.willDeleteStorageFiles ? "是" : "否"} />
              <Metric label="root 来源" value={result.storageRootSource === "db" ? "后台配置" : ".env fallback"} />
              <Metric label="重建目录" value={result.rebuiltDefaults.standardDirectoryCount} />
              <Metric label="Workspace" value={result.rebuiltDefaults.workspaceCode} />
              <Metric label="StorageProvider" value={result.rebuiltDefaults.storageProviderCode} />
              <Metric label="默认栏目" value={result.rebuiltDefaults.categoryCount} />
              <Metric label="清空记录" value={sumRecordCounts(result.deletedRecords)} />
            </div>
          </Surface>
        ) : null}
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 truncate font-semibold", skin.typography.value)}>{value}</p>
    </Surface>
  );
}

function sumRecordCounts(records: Record<string, number>) {
  return Object.values(records).reduce((sum, value) => sum + value, 0);
}

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

const REQUIRED_CONFIRMATION = "PERMANENT_RESET_SYSTEM";

type SystemResetPreview = {
  generatedAt: string;
  requiredConfirmation: string;
  storageRoot: string;
  storageRootSafety: {
    ok: boolean;
    message: string;
  };
  storageRootTopLevel: {
    directoryCount: number;
    fileCount: number;
    entries: Array<{ name: string; type: "directory" | "file" | "symlink" | "other" }>;
  };
  storageRootRecursive: {
    directoryCount: number;
    fileCount: number;
  };
  hasRunningIngestionJob: boolean;
  counts: Record<string, number>;
};

type SystemResetResult = {
  executedAt: string;
  operatorName: string;
  sqliteBackupPath: string;
  storageRoot: string;
  deletedStorage: {
    deletedTopLevelEntries: number;
    deletedDirectories: number;
    deletedFiles: number;
  };
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
    () => confirmation === REQUIRED_CONFIRMATION && !busy && preview?.storageRootSafety.ok && !preview.hasRunningIngestionJob,
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
      `将永久清空 STORAGE_ROOT 内全部内容，并清空业务数据库记录。\n\n确认短语：${REQUIRED_CONFIRMATION}\n\n执行前会备份 SQLite。此操作不可从存储目录恢复，是否继续？`
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
        operatorName,
        deleteStorageRootContents: true
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
    <Panel padding="none" className="overflow-hidden border-red-200 bg-red-50/30" style={skin.vars}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-red-200 px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>系统初始化</p>
          <p className={cn("mt-1 text-red-900/80", skin.typography.meta)}>永久清空测试数据并恢复新安装状态</p>
        </div>
        <StatusPill tone="danger" withDot>高危操作</StatusPill>
      </div>

      <div className="space-y-3 p-[var(--skin-panel-padding)]">
        <Surface tone="muted" padding="sm" className={cn("border-red-200 bg-white/80 text-red-950", skin.typography.body)}>
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">本操作会永久删除 STORAGE_ROOT 内所有子内容，不归档存储目录。</p>
              <p className={skin.typography.meta}>保留项目代码、.env、docs、schema、package 文件、现有备份文件，并在删除前新增 SQLite 备份。</p>
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
            <p className={skin.typography.label}>STORAGE_ROOT</p>
            <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{preview?.storageRoot || "读取中..."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone={preview?.storageRootSafety.ok ? "success" : "danger"}>
                {preview?.storageRootSafety.message || "等待校验"}
              </StatusPill>
              <StatusPill tone={preview?.hasRunningIngestionJob ? "danger" : "success"}>
                {preview?.hasRunningIngestionJob ? "存在 RUNNING 任务" : "无 RUNNING 任务"}
              </StatusPill>
            </div>
          </Surface>
          <Surface tone="muted" padding="sm">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="顶层目录" value={preview?.storageRootTopLevel.directoryCount ?? 0} />
              <Metric label="顶层文件" value={preview?.storageRootTopLevel.fileCount ?? 0} />
              <Metric label="递归目录" value={preview?.storageRootRecursive.directoryCount ?? 0} />
              <Metric label="递归文件" value={preview?.storageRootRecursive.fileCount ?? 0} />
            </div>
          </Surface>
        </div>

        {preview?.storageRootTopLevel.entries.length ? (
          <Surface tone="muted" padding="sm" className={cn("max-h-28 overflow-auto", skin.typography.meta)}>
            <p className="mb-1 font-semibold text-foreground">将删除的 STORAGE_ROOT 顶层内容</p>
            <div className="flex flex-wrap gap-1">
              {preview.storageRootTopLevel.entries.map((entry) => (
                <span key={entry.name} className="rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border)] bg-white px-2 py-1">
                  {entry.name} / {entry.type}
                </span>
              ))}
            </div>
          </Surface>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <Surface tone="muted" padding="sm" className={skin.typography.bodyDense}>
            <p className="font-semibold">将永久删除</p>
            <p className="mt-1 text-muted-foreground">旧素材原片、metadata JSON、_derivatives、处理中临时帧、失败目录、回收站、设备导入历史内容，以及业务数据表记录。</p>
          </Surface>
          <Surface tone="muted" padding="sm" className={skin.typography.bodyDense}>
            <p className="font-semibold">将恢复</p>
            <p className="mt-1 text-muted-foreground">默认 workspace、local-default 存储、默认主题菜单术语行业模板、默认栏目和标准目录结构。</p>
          </Surface>
        </div>

        <Surface tone="muted" padding="sm" className={cn("border-amber-200 bg-amber-50/70 text-amber-950", skin.typography.bodyDense)}>
          <div className="flex items-start gap-2">
            <DatabaseBackup className="mt-0.5 h-4 w-4 shrink-0" />
            <p>执行前会备份 SQLite 到 prisma/dev.db.system-reset-backup-YYYYMMDD-HHMMSS；如同名存在会追加序号。</p>
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
            <AlertTriangle className="mr-2 h-4 w-4" /> 永久清空并恢复初始状态
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
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="删除顶层项" value={result.deletedStorage.deletedTopLevelEntries} />
              <Metric label="删除目录" value={result.deletedStorage.deletedDirectories} />
              <Metric label="删除文件" value={result.deletedStorage.deletedFiles} />
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

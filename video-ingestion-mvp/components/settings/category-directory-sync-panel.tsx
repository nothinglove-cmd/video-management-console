"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderCheck, RefreshCcw, SearchCheck, ShieldCheck } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type SyncItem = {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  status: string;
  relativePath: string;
  absolutePath: string;
  metadataRelativePath: string;
  directoryExists: boolean;
  metadataExists: boolean;
  metadataWillBeWritten: boolean;
};

type SkippedItem = {
  categoryId: string;
  categoryName: string;
  categoryCode: string;
  reason: string;
};

type SyncPreview = {
  generatedAt: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  categoryTotal: number;
  syncableCount: number;
  existingDirectoryCount: number;
  missingDirectoryCount: number;
  categoryMetadataMissingCount: number;
  categoryMetadataRewriteCount: number;
  skippedCount: number;
  willDeleteDirectories: false;
  willMoveMaterials: false;
  willRestoreDefaultCategories: false;
  items: SyncItem[];
  skipped: SkippedItem[];
  errors: string[];
};

type SyncResult = {
  executedAt: string;
  storageRoot: string;
  storageRootSource: "db" | "env";
  createdDirectoryCount: number;
  existingDirectoryCount: number;
  metadataWrittenCount: number;
  skippedCount: number;
  failed: Array<{
    categoryId: string;
    categoryName: string;
    relativePath?: string;
    message: string;
  }>;
  message: string;
};

export function CategoryDirectorySyncPanel() {
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"preview" | "sync" | "">("");

  const canSync = useMemo(() => Boolean(preview) && !busy, [busy, preview]);

  useEffect(() => {
    void loadPreview();
  }, []);

  async function loadPreview() {
    setBusy("preview");
    setMessage("");
    const response = await fetch("/api/admin/categories/sync-directories/preview", { method: "GET", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage(data.error || "读取栏目目录同步预览失败。");
      return;
    }
    setPreview(data);
  }

  async function runSync() {
    if (!preview) {
      setMessage("请先预览目录差异。");
      return;
    }
    const confirmed = window.confirm(
      "将根据当前数据库 Category 补齐真实目录并写入/重写 .category.json。\n\n不会删除多余目录，不会移动素材，不会恢复默认栏目，不会修改 Material 栏目归属。是否继续？"
    );
    if (!confirmed) return;

    setBusy("sync");
    setMessage("");
    setResult(null);
    const response = await fetch("/api/admin/categories/sync-directories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage(data.error || "栏目目录同步失败。");
      return;
    }
    setResult(data);
    setMessage(data.message || "栏目目录同步完成。建议继续运行系统修复里的“扫描目录”。");
    await loadPreview();
  }

  return (
    <Panel padding="none" className="overflow-hidden" style={skin.vars}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>栏目目录同步</p>
          <p className={cn("mt-1", skin.typography.meta)}>根据当前栏目配置补齐真实文件夹和 .category.json</p>
        </div>
        <StatusPill tone="info" withDot>只补齐</StatusPill>
      </div>

      <div className={cn("space-y-3 p-[var(--skin-panel-padding)]", skin.typography.body)}>
        <Surface tone="muted" padding="sm" className={cn("border-sky-200 bg-sky-50/70 text-sky-950", skin.typography.bodyDense)}>
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              同步只创建缺失目录并写入/重写 .category.json；不删除多余目录，不移动素材，不恢复默认栏目，不修改 Material 栏目归属，不自动导入孤儿文件。
            </p>
          </div>
        </Surface>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Category 总数" value={preview?.categoryTotal ?? 0} icon={FolderCheck} />
          <MetricCard label="可同步" value={preview?.syncableCount ?? 0} icon={SearchCheck} />
          <MetricCard label="缺失目录" value={preview?.missingDirectoryCount ?? 0} icon={FolderCheck} tone={(preview?.missingDirectoryCount ?? 0) > 0 ? "warning" : "success"} />
          <MetricCard label=".category.json 缺失" value={preview?.categoryMetadataMissingCount ?? 0} icon={SearchCheck} tone={(preview?.categoryMetadataMissingCount ?? 0) > 0 ? "warning" : "success"} />
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.4fr)]">
          <Surface tone="muted" padding="sm" className="min-w-0">
            <p className={skin.typography.label}>当前 effective storage root</p>
            <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{preview?.storageRoot || "读取中..."}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusPill tone="info">来源：{preview?.storageRootSource === "db" ? "后台保存配置" : ".env fallback"}</StatusPill>
              <StatusPill tone="success">不删除目录</StatusPill>
              <StatusPill tone="success">不移动素材</StatusPill>
            </div>
          </Surface>
          <Surface tone="muted" padding="sm">
            <div className="grid grid-cols-2 gap-2">
              <SmallMetric label="目录已存在" value={preview?.existingDirectoryCount ?? 0} />
              <SmallMetric label="metadata 可重写" value={preview?.categoryMetadataRewriteCount ?? 0} />
              <SmallMetric label="跳过" value={preview?.skippedCount ?? 0} />
              <SmallMetric label="错误" value={preview?.errors.length ?? 0} />
            </div>
          </Surface>
        </div>

        {preview?.skipped.length ? (
          <Surface tone="muted" padding="sm" className={cn("max-h-32 overflow-auto border-amber-200 bg-amber-50/70 text-amber-950", skin.typography.meta)}>
            <p className="mb-1 font-semibold">跳过项</p>
            {preview.skipped.slice(0, 20).map((item) => (
              <p key={item.categoryId} className="break-all">{item.categoryName}：{item.reason}</p>
            ))}
          </Surface>
        ) : null}

        {preview?.errors.length ? (
          <Surface tone="muted" padding="sm" className={cn("max-h-32 overflow-auto border-red-200 bg-red-50/70 text-red-950", skin.typography.meta)}>
            <p className="mb-1 font-semibold">预览错误</p>
            {preview.errors.slice(0, 20).map((item) => (
              <p key={item} className="break-all">{item}</p>
            ))}
          </Surface>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="min-h-10" onClick={loadPreview} disabled={Boolean(busy)}>
            <RefreshCcw className="mr-2 h-4 w-4" /> {busy === "preview" ? "预览中..." : "预览目录差异"}
          </Button>
          <Button className="min-h-10" onClick={runSync} disabled={!canSync}>
            <FolderCheck className="mr-2 h-4 w-4" /> {busy === "sync" ? "同步中..." : "同步栏目文件夹"}
          </Button>
        </div>

        {message ? (
          <Surface tone="muted" padding="sm" className={skin.typography.bodyDense}>
            <StatusPill tone={message.includes("失败") ? "danger" : "success"}>{message}</StatusPill>
          </Surface>
        ) : null}

        {result ? (
          <Surface tone="muted" padding="sm" className={cn("space-y-2", skin.typography.bodyDense)}>
            <p className="font-semibold">同步结果</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <SmallMetric label="创建目录" value={result.createdDirectoryCount} />
              <SmallMetric label="已有目录" value={result.existingDirectoryCount} />
              <SmallMetric label="写入 metadata" value={result.metadataWrittenCount} />
              <SmallMetric label="跳过" value={result.skippedCount} />
              <SmallMetric label="失败" value={result.failed.length} />
            </div>
          </Surface>
        ) : null}
      </div>
    </Panel>
  );
}

function SmallMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 truncate font-semibold", skin.typography.value)}>{value}</p>
    </Surface>
  );
}

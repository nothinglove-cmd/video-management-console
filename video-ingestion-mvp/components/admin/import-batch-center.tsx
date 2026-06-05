"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, Clock3, RefreshCcw, RotateCcw, Search, UploadCloud } from "lucide-react";

import type { MaterialDto } from "@/components/materials/types";
import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/ui/metric-card";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn, formatBytes, toLocalDateTime } from "@/lib/utils";

type BatchSummaryDto = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  needsReview: number;
  retryable: number;
  received: number;
  displayStatus: string;
  statusText: string;
};

type ImportBatchDto = {
  batchId: string;
  sourceType: string;
  uploaderName?: string | null;
  fileCount: number;
  totalSize: number;
  status: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BatchListItemDto = {
  batch: ImportBatchDto;
  summary: BatchSummaryDto;
};

type ImportJobDto = {
  jobId: string;
  originalFileName: string;
  fileSize: number;
  sourceType: string;
  incomingRelativePath: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  materialId?: string | null;
  attempts?: number;
  lastError?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

type BatchDetailDto = {
  batch: ImportBatchDto;
  summary: BatchSummaryDto;
  jobs: ImportJobDto[];
  materials: MaterialDto[];
};

const STATUS_OPTIONS = [
  ["ALL", "全部状态"],
  ["UPLOADING", "接收中"],
  ["PROCESSING", "处理中"],
  ["NEEDS_REVIEW", "待确认"],
  ["IMPORTED", "已完成"],
  ["PARTIAL_FAILED", "部分失败"],
  ["FAILED", "失败"]
];

const SOURCE_OPTIONS = [
  ["ALL", "全部来源"],
  ["WEB_MOBILE_UPLOAD", "手机上传"],
  ["WEB_DESKTOP_UPLOAD", "电脑上传"],
  ["DEVICE_IMPORT", "设备导入"],
  ["MANUAL_IMPORT", "手工导入"]
];

export function ImportBatchCenter() {
  const [batches, setBatches] = useState<BatchListItemDto[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [detail, setDetail] = useState<BatchDetailDto | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [sourceType, setSourceType] = useState("ALL");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState("");

  const metrics = useMemo(() => buildMetrics(batches), [batches]);
  const activeRunning = Boolean(detail && (detail.summary.queued > 0 || detail.summary.running > 0 || detail.summary.displayStatus === "UPLOADING"));

  useEffect(() => {
    loadBatches().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, [submittedQuery, status, sourceType, limit]);

  useEffect(() => {
    if (!activeBatchId || !activeRunning) return;
    const timer = window.setInterval(() => {
      refreshActive().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [activeBatchId, activeRunning]);

  async function loadBatches() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: String(limit) });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    if (status !== "ALL") params.set("status", status);
    if (sourceType !== "ALL") params.set("sourceType", sourceType);

    const response = await fetch(`/api/import-batches?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { batches?: BatchListItemDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "批次列表读取失败。");

    const nextBatches = data.batches || [];
    setBatches(nextBatches);
    setLoading(false);

    const nextActive = activeBatchId && nextBatches.some((item) => item.batch.batchId === activeBatchId)
      ? activeBatchId
      : nextBatches[0]?.batch.batchId || "";
    if (nextActive) {
      await openBatch(nextActive, true);
    } else {
      setActiveBatchId("");
      setDetail(null);
    }
  }

  async function openBatch(batchId: string, silent = false) {
    if (!silent) setMessage("");
    setDetailLoading(true);
    const response = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as (BatchDetailDto & { error?: string }) | null;
    setDetailLoading(false);
    if (!response.ok || !data) {
      setMessage(data?.error || "批次详情读取失败。");
      return;
    }
    setActiveBatchId(batchId);
    setDetail(data);
  }

  async function refreshActive() {
    await Promise.all([
      loadBatches(),
      activeBatchId ? openBatch(activeBatchId, true) : Promise.resolve()
    ]);
  }

  async function retryFailed(jobIds?: string[]) {
    if (!activeBatchId) return;
    setMessage("");
    const response = await fetch(`/api/import-batches/${encodeURIComponent(activeBatchId)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobIds?.length ? { jobIds } : {})
    });
    const data = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) {
      setMessage(data.error || "重试失败项失败。");
      return;
    }
    setMessage(data.message || "失败项已重新加入后台队列。");
    await openBatch(activeBatchId, true);
    await loadBatches();
  }

  function submitSearch() {
    setSubmittedQuery(query.trim());
  }

  return (
    <div style={skin.vars} className="space-y-4">
      <Panel className="space-y-3">
        <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(260px,1fr)_auto] lg:items-start">
          <div className="relative min-w-0">
            <Input
              className="h-[var(--skin-toolbar-control-height)] bg-[color:var(--skin-surface-input)] pr-10"
              value={query}
              placeholder="搜索 batchId、上传人或备注"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitSearch();
              }}
            />
            <button type="button" className="absolute right-2 top-2 rounded-[var(--skin-radius-sm)] p-1 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]" onClick={submitSearch} aria-label="搜索批次">
              <Search className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
            <Select className="h-[var(--skin-toolbar-control-height)] min-w-[8rem] flex-1 sm:flex-none" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select className="h-[var(--skin-toolbar-control-height)] min-w-[8rem] flex-1 sm:flex-none" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select className="h-[var(--skin-toolbar-control-height)] min-w-[7rem] flex-1 sm:flex-none" value={String(limit)} onChange={(event) => setLimit(Number(event.target.value))}>
              <option value="20">最近 20</option>
              <option value="50">最近 50</option>
              <option value="100">最近 100</option>
              <option value="200">最近 200</option>
            </Select>
            <Button className="h-[var(--skin-toolbar-control-height)]" variant="secondary" onClick={() => loadBatches().catch((error) => setMessage(error.message))}>
              <RefreshCcw className="mr-1 h-4 w-4" /> 刷新
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-[color:var(--skin-border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="neutral">批次 {loading ? "..." : batches.length}</StatusPill>
            <StatusPill tone="info">总量 {formatBytes(metrics.totalSize)}</StatusPill>
            {activeRunning ? <StatusPill tone="processing" withDot>自动刷新中</StatusPill> : null}
          </div>
          {message ? <p className={cn("min-w-0 truncate text-primary sm:text-right", skin.typography.meta)}>{message}</p> : null}
        </div>
      </Panel>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="当前批次" value={metrics.totalBatches} icon={Archive} tone="neutral" />
        <MetricCard label="后台处理中" value={metrics.activeBatches} icon={Clock3} tone="processing" />
        <MetricCard label="失败批次" value={metrics.failedBatches} icon={AlertTriangle} tone={metrics.failedBatches > 0 ? "danger" : "neutral"} />
        <MetricCard label="可重试任务" value={metrics.retryableJobs} icon={RotateCcw} tone={metrics.retryableJobs > 0 ? "warning" : "neutral"} />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(320px,430px)_minmax(0,1fr)]">
        <BatchListPanel
          batches={batches}
          activeBatchId={activeBatchId}
          loading={loading}
          onOpen={(batchId) => openBatch(batchId).catch((error) => setMessage(error.message))}
        />
        <BatchDetailPanel
          detail={detail}
          loading={detailLoading}
          onRefresh={() => refreshActive().catch((error) => setMessage(error.message))}
          onRetryFailed={() => retryFailed()}
          onRetryJob={(jobId) => retryFailed([jobId])}
        />
      </section>
    </div>
  );
}

function BatchListPanel({
  batches,
  activeBatchId,
  loading,
  onOpen
}: {
  batches: BatchListItemDto[];
  activeBatchId: string;
  loading: boolean;
  onOpen: (batchId: string) => void;
}) {
  return (
    <Panel padding="none" className="min-w-0 overflow-hidden">
      <div className="border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)]">
        <h2 className={skin.typography.panelTitle}>批次列表</h2>
        <p className={cn("mt-1", skin.typography.meta)}>按创建时间倒序显示，可快速切换到失败或正在处理的批次。</p>
      </div>
      <div className="thin-scrollbar max-h-[720px] min-h-40 overflow-auto p-[var(--skin-panel-padding)]">
        {loading ? <p className={cn("text-muted-foreground", skin.typography.body)}>正在加载批次...</p> : null}
        {!loading && batches.length === 0 ? (
          <EmptyState compact icon={Archive} title="暂无批次" description="上传或设备导入创建批次后，会出现在这里。" />
        ) : null}
        <div className="space-y-2">
          {batches.map(({ batch, summary }) => (
            <button
              key={batch.batchId}
              type="button"
              className={cn(
                skin.listItem,
                "w-full p-3 text-left",
                activeBatchId === batch.batchId && "border-primary ring-1 ring-primary"
              )}
              onClick={() => onOpen(batch.batchId)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("truncate font-semibold text-primary", skin.typography.bodyDense)}>{batch.batchId}</p>
                  <p className={cn("mt-1", skin.typography.meta)}>
                    {sourceLabel(batch.sourceType)} · {toLocalDateTime(batch.createdAt)}
                  </p>
                </div>
                <StatusPill tone={batchStatusTone(summary.displayStatus)} withDot>{batchStatusLabel(summary.displayStatus)}</StatusPill>
              </div>
              <div className={cn("mt-3 grid grid-cols-2 gap-2", skin.typography.meta)}>
                <BatchMetric label="已接收" value={`${summary.received}/${summary.total}`} />
                <BatchMetric label="完成" value={String(summary.succeeded)} tone="success" />
                <BatchMetric label="待确认" value={String(summary.needsReview)} tone="review" />
                <BatchMetric label="失败" value={String(summary.failed)} tone={summary.failed > 0 ? "danger" : "neutral"} />
              </div>
              <p className={cn("mt-2 line-clamp-2", skin.typography.meta)}>{summary.statusText}</p>
              <p className={cn("mt-1", skin.typography.meta)}>{formatBytes(batch.totalSize)} · {batch.uploaderName || "未填写上传人"}</p>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function BatchDetailPanel({
  detail,
  loading,
  onRefresh,
  onRetryFailed,
  onRetryJob
}: {
  detail: BatchDetailDto | null;
  loading: boolean;
  onRefresh: () => void;
  onRetryFailed: () => void;
  onRetryJob: (jobId: string) => void;
}) {
  if (!detail) {
    return (
      <Panel>
        <EmptyState compact icon={Archive} title={loading ? "正在读取批次详情" : "请选择批次"} description="左侧选择批次后，可以查看任务、失败原因、素材记录和重试入口。" />
      </Panel>
    );
  }

  const failedJobs = detail.jobs.filter((job) => job.status === "FAILED");
  const activeJobs = detail.jobs.filter((job) => job.status === "QUEUED" || job.status === "RUNNING").length;

  return (
    <Panel padding="none" className="min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)] lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={cn("break-all", skin.typography.panelTitle)}>{detail.batch.batchId}</h2>
            <StatusPill tone={batchStatusTone(detail.summary.displayStatus)} withDot>{batchStatusLabel(detail.summary.displayStatus)}</StatusPill>
          </div>
          <p className={cn("mt-1", skin.typography.meta)}>
            {sourceLabel(detail.batch.sourceType)} · {toLocalDateTime(detail.batch.createdAt)} · {formatBytes(detail.batch.totalSize)}
          </p>
          <p className={cn("mt-2", skin.typography.body)}>{detail.summary.statusText}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RefreshCcw className="mr-1 h-4 w-4" /> 刷新{activeJobs ? `（${activeJobs}）` : ""}
          </Button>
          <Button variant="secondary" size="sm" disabled={detail.summary.retryable === 0} onClick={onRetryFailed}>
            <RotateCcw className="mr-1 h-4 w-4" /> 重试失败项（{detail.summary.retryable}）
          </Button>
        </div>
      </div>

      <div className="space-y-4 p-[var(--skin-panel-padding)]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="文件已接收" value={`${detail.summary.received}/${detail.summary.total}`} icon={UploadCloud} tone="info" />
          <MetricCard label="排队/处理中" value={detail.summary.queued + detail.summary.running} icon={Clock3} tone="processing" />
          <MetricCard label="成功入库" value={detail.summary.succeeded} icon={CheckCircle2} tone="success" />
          <MetricCard label="失败/可重试" value={`${detail.summary.failed}/${detail.summary.retryable}`} icon={AlertTriangle} tone={detail.summary.failed > 0 ? "danger" : "neutral"} />
        </div>

        <Surface tone="muted" className="space-y-2">
          <h3 className={skin.typography.cardTitle}>批次信息</h3>
          <div className={cn("grid gap-2 sm:grid-cols-2 xl:grid-cols-4", skin.typography.meta)}>
            <InfoLine label="上传人" value={detail.batch.uploaderName || "-"} />
            <InfoLine label="文件数" value={String(detail.batch.fileCount)} />
            <InfoLine label="总大小" value={formatBytes(detail.batch.totalSize)} />
            <InfoLine label="更新时间" value={toLocalDateTime(detail.batch.updatedAt)} />
          </div>
          {detail.batch.notes ? <p className={cn("break-words", skin.typography.meta)}>备注：{detail.batch.notes}</p> : null}
        </Surface>

        <JobTable jobs={detail.jobs} onRetryJob={onRetryJob} />
        <MaterialSummary materials={detail.materials} />

        {failedJobs.length > 0 ? (
          <Surface tone="plain" className="border-red-200 bg-red-50 text-red-800">
            <p className={skin.typography.bodyDense}>失败任务会保留 lastError。源文件仍存在时可以点击单项重试或重试全部失败项。</p>
          </Surface>
        ) : null}
      </div>
    </Panel>
  );
}

function JobTable({ jobs, onRetryJob }: { jobs: ImportJobDto[]; onRetryJob: (jobId: string) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={skin.typography.cardTitle}>后台任务</h3>
        <StatusPill tone="neutral">{jobs.length} 个 job</StatusPill>
      </div>
      {jobs.length === 0 ? (
        <EmptyState compact icon={Clock3} title="暂无后台任务" description="批次可能还在接收阶段，或是迁移前遗留的半批次。" />
      ) : (
        <ResponsiveTableShell className="max-w-full">
          <table className={cn("w-full min-w-[980px]", skin.typography.tableCell)}>
            <thead className={skin.table.header}>
              <tr>
                <th className="px-3 py-2 text-left">文件</th>
                <th className="px-3 py-2 text-left">状态</th>
                <th className="px-3 py-2 text-left">大小</th>
                <th className="px-3 py-2 text-left">尝试</th>
                <th className="px-3 py-2 text-left">素材</th>
                <th className="px-3 py-2 text-left">失败原因</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.jobId} className={skin.table.row}>
                  <td className="max-w-[260px] px-3 py-2">
                    <p className="line-clamp-2 break-all font-medium">{job.originalFileName}</p>
                    <p className={cn("mt-1 line-clamp-1 break-all", skin.typography.meta)}>{job.incomingRelativePath}</p>
                  </td>
                  <td className="px-3 py-2"><StatusPill tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</StatusPill></td>
                  <td className={cn("whitespace-nowrap px-3 py-2", skin.typography.meta)}>{formatBytes(job.fileSize)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2", skin.typography.meta)}>{job.attempts ?? 0}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2", skin.typography.meta)}>{job.materialId || "-"}</td>
                  <td className="max-w-[340px] px-3 py-2">
                    {job.lastError ? <p className="line-clamp-3 break-words text-red-700">{job.lastError}</p> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2">
                    {job.status === "FAILED" ? (
                      <Button variant="secondary" size="sm" onClick={() => onRetryJob(job.jobId)}>重试</Button>
                    ) : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTableShell>
      )}
    </div>
  );
}

function MaterialSummary({ materials }: { materials: MaterialDto[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={skin.typography.cardTitle}>已生成素材</h3>
        <StatusPill tone="neutral">{materials.length} 条 material</StatusPill>
      </div>
      {materials.length === 0 ? (
        <Surface tone="muted">
          <p className={cn("text-muted-foreground", skin.typography.body)}>后台任务成功前不会创建素材记录。</p>
        </Surface>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {materials.slice(0, 8).map((material) => (
            <Surface key={material.id} tone="plain" className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={cn("font-semibold text-primary", skin.typography.bodyDense)}>{material.materialId}</p>
                <StatusPill tone={materialStatusTone(material.status)}>{materialStatusLabel(material.status)}</StatusPill>
              </div>
              <p className={cn("mt-1 line-clamp-2 break-all", skin.typography.meta)}>{material.storedFileName}</p>
              <p className={cn("mt-1", skin.typography.meta)}>{material.primaryCategory || "-"} · {toLocalDateTime(material.createdAt)}</p>
            </Surface>
          ))}
          {materials.length > 8 ? (
            <Surface tone="muted">
              <p className={skin.typography.meta}>另有 {materials.length - 8} 条素材未展开，可到素材库继续筛选。</p>
            </Surface>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BatchMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: SkinStatusTone }) {
  return (
    <div className="rounded-[var(--skin-radius-control)] bg-[color:var(--skin-muted-bg)] px-2 py-1.5">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-0.5 font-semibold", skin.status[tone].text)}>{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={skin.typography.label}>{label}</p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}

function buildMetrics(batches: BatchListItemDto[]) {
  return {
    totalBatches: batches.length,
    activeBatches: batches.filter(({ summary }) => summary.queued > 0 || summary.running > 0 || summary.displayStatus === "UPLOADING").length,
    failedBatches: batches.filter(({ summary }) => summary.failed > 0 || summary.displayStatus === "FAILED" || summary.displayStatus === "PARTIAL_FAILED").length,
    retryableJobs: batches.reduce((sum, item) => sum + item.summary.retryable, 0),
    totalSize: batches.reduce((sum, item) => sum + item.batch.totalSize, 0)
  };
}

function sourceLabel(source?: string) {
  if (source === "WEB_MOBILE_UPLOAD") return "手机上传";
  if (source === "WEB_DESKTOP_UPLOAD") return "电脑上传";
  if (source === "DEVICE_IMPORT") return "设备导入";
  if (source === "MANUAL_IMPORT") return "手工导入";
  return source || "未知来源";
}

function batchStatusLabel(status: string) {
  if (status === "UPLOADING") return "接收中";
  if (status === "PROCESSING") return "处理中";
  if (status === "NEEDS_REVIEW") return "待确认";
  if (status === "IMPORTED") return "已完成";
  if (status === "PARTIAL_FAILED") return "部分失败";
  if (status === "FAILED") return "失败";
  return status;
}

function batchStatusTone(status: string): SkinStatusTone {
  if (status === "IMPORTED") return "success";
  if (status === "UPLOADING" || status === "PROCESSING") return "processing";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "PARTIAL_FAILED") return "warning";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function jobStatusLabel(status: ImportJobDto["status"]) {
  if (status === "QUEUED") return "排队中";
  if (status === "RUNNING") return "处理中";
  if (status === "SUCCEEDED") return "完成";
  return "失败";
}

function jobStatusTone(status: ImportJobDto["status"]): SkinStatusTone {
  if (status === "SUCCEEDED") return "success";
  if (status === "RUNNING" || status === "QUEUED") return "processing";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function materialStatusLabel(status: string) {
  if (status === "READY") return "已入库";
  if (status === "IMPORTED") return "已导入";
  if (status === "NEEDS_REVIEW") return "待确认";
  if (status === "FAILED") return "失败";
  return status;
}

function materialStatusTone(status: string): SkinStatusTone {
  if (status === "READY" || status === "IMPORTED") return "success";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "FAILED") return "danger";
  return "neutral";
}

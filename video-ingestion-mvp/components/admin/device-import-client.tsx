"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clipboard, FolderOpen, FolderSearch, Loader2, Play, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { skin } from "@/components/theme/skin";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatBytes } from "@/lib/utils";

type DeviceImportSampleFile = {
  name: string;
  size: number;
  modifiedAt: string;
  large: boolean;
  huge: boolean;
};

type ReadyFolder = {
  folderName: string;
  relativePath: string;
  ready: boolean;
  fileCount: number;
  totalSize: number;
  largestFile: DeviceImportSampleFile | null;
  largeFileCount: number;
  hugeFileCount: number;
  files: string[];
  sampleFiles: DeviceImportSampleFile[];
  warnings: string[];
  isImporting?: boolean;
  importingBatchId?: string;
  importingInfo?: {
    batchId?: string;
    createdAt?: string;
    fileCount?: number;
    folderRelativePath?: string;
  } | null;
};

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
};

type BatchDetailDto = {
  batch: {
    batchId: string;
    sourceType: string;
    fileCount: number;
    totalSize: number;
    status: string;
    createdAt: string;
  };
  summary: BatchSummaryDto;
  jobs: ImportJobDto[];
};

export function DeviceImportClient() {
  const [folders, setFolders] = useState<ReadyFolder[]>([]);
  const [deviceImportPath, setDeviceImportPath] = useState("");
  const [uploaderName, setUploaderName] = useState("设备导入");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyFolder, setBusyFolder] = useState("");
  const [message, setMessage] = useState("");
  const [activeBatchId, setActiveBatchId] = useState("");
  const [batchDetail, setBatchDetail] = useState<BatchDetailDto | null>(null);

  async function scan() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/device-import", { cache: "no-store" });
    const data = (await response.json()) as { folders: ReadyFolder[]; deviceImportPath: string };
    setFolders(data.folders);
    setDeviceImportPath(data.deviceImportPath);
    setLoading(false);
  }

  useEffect(() => {
    scan().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, []);

  async function startImport(folderName: string) {
    if (isBatchActive(batchDetail)) return;
    setBusyFolder(folderName);
    setMessage("正在执行导入前预检：检查 _READY.txt、文件稳定性、权限和跨卷风险。");
    const response = await fetch("/api/device-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName, uploaderName, notes })
    });
    const data = await response.json().catch(() => ({}));
    setBusyFolder("");
    if (!response.ok) {
      setMessage(data.error || "导入失败。");
      return;
    }
    setActiveBatchId(data.batchId);
    setMessage(`已创建导入批次 ${data.batchId}，后台处理中。`);
    await refreshBatch(data.batchId);
    await scan();
  }

  async function refreshBatch(batchId = activeBatchId) {
    if (!batchId) return;
    const response = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as BatchDetailDto & { error?: string } | null;
    if (!response.ok || !data) {
      setMessage(data?.error || "刷新批次状态失败。");
      return;
    }
    setBatchDetail(data);
    setActiveBatchId(batchId);
  }

  async function retryFailedJobs() {
    if (!activeBatchId) return;
    const response = await fetch(`/api/import-batches/${encodeURIComponent(activeBatchId)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      message?: string;
      skippedMissingSourceCount?: number;
    };
    if (!response.ok) {
      setMessage(data.error || "重试失败项失败。");
      return;
    }
    setMessage(data.message || "失败项已重新加入队列。");
    await refreshBatch(activeBatchId);
  }

  const activeBatchRunning = isBatchActive(batchDetail);

  useEffect(() => {
    if (!activeBatchId || !activeBatchRunning) return;
    const timer = window.setInterval(() => {
      refreshBatch(activeBatchId).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeBatchId, activeBatchRunning]);

  async function copyPath() {
    await navigator.clipboard?.writeText(deviceImportPath);
    setMessage("设备拷贝目录路径已复制。");
  }

  async function openDirectory() {
    const response = await fetch("/api/device-import/open", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "已尝试打开目录。" : `打开目录失败：${data.error || "当前环境不支持"}`);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>大文件导入目录</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={cn("rounded-lg border bg-slate-50 p-3", skin.typography.path)}>
              {deviceImportPath || "正在读取目录..."}
            </div>
            <p className={cn("text-muted-foreground", skin.typography.meta)}>
              10GB+ 原片、50GB+ 直播录屏、NAS 或移动硬盘素材放到这里后再创建 _READY.txt。网页上传保留给小文件和中等文件。
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={copyPath} disabled={!deviceImportPath}>
                <Clipboard className="mr-2 h-4 w-4" /> 复制路径
              </Button>
              <Button variant="secondary" onClick={openDirectory} disabled={!deviceImportPath}>
                <FolderOpen className="mr-2 h-4 w-4" /> 打开目录
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>批次信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
              上传人
              <Input value={uploaderName} onChange={(event) => setUploaderName(event.target.value)} />
            </label>
            <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
              备注
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>
            <Button className="w-full" variant="secondary" onClick={scan}>
              <FolderSearch className="mr-2 h-4 w-4" /> 重新扫描
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>目录导入流程</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            {[
              "把整批素材放入 01_待导入/设备拷贝",
              "确认拷贝完成后创建 _READY.txt",
              "重新扫描并检查大小与风险提示",
              "开始导入，后台逐个入库"
            ].map((step, index) => (
              <div key={step} className={cn("rounded-lg border bg-slate-50 p-3", skin.typography.body)}>
                <div className={cn("mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground", skin.typography.badge)}>
                  {index + 1}
                </div>
                {step}
              </div>
            ))}
          </CardContent>
          <CardContent className="border-t pt-3">
            <p className={cn("text-muted-foreground", skin.typography.meta)}>
              预检会确认文件可读、目录可写、文件 size/mtime 稳定，并阻止 10GB+ 文件静默跨卷复制。剩余空间仍需人工确认，尤其是 50GB+ 直播录屏。
            </p>
          </CardContent>
        </Card>

        {message ? (
          <div className={cn(
            "flex items-center gap-2 rounded-lg border bg-white p-3",
            isErrorMessage(message) ? "text-red-700" : "text-primary",
            skin.typography.body
          )}>
            {isErrorMessage(message) ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
            {message}
          </div>
        ) : null}

        {batchDetail ? (
          <BatchStatusPanel
            detail={batchDetail}
            onRefresh={() => refreshBatch()}
            onRetryFailed={retryFailedJobs}
          />
        ) : null}

        {loading ? (
          <div className={cn("flex items-center gap-2 rounded-xl border bg-white p-6 text-muted-foreground", skin.typography.body)}>
            <Loader2 className="h-5 w-5 animate-spin" /> 正在扫描设备拷贝目录...
          </div>
        ) : null}

        {!loading && folders.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <EmptyState
                compact
                icon={FolderSearch}
                title="暂无可导入批次"
                description={
                  <div className="space-y-2">
                    <p>把一批视频/图片放入设备拷贝目录。拷贝完成后创建 <span className="font-mono text-foreground">_READY.txt</span>，扫描后才能开始导入。</p>
                    <div className={cn("rounded-[var(--skin-radius-control)] bg-[color:var(--skin-muted-bg)] p-3", skin.textDensity.metadata)}>
                      01_待导入/设备拷贝/20260508_阿阳_小院素材/_READY.txt
                    </div>
                  </div>
                }
                action={<Button variant="secondary" onClick={scan}>重新扫描</Button>}
              />
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {folders.map((folder) => (
            <Card key={folder.folderName}>
              <CardHeader>
                <CardTitle>{folder.folderName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className={cn("break-all", skin.typography.meta)}>{folder.relativePath}</p>
                <div className={cn("grid gap-2 rounded-lg border bg-slate-50 p-3 sm:grid-cols-2", skin.typography.meta)}>
                  <span>文件数：{folder.fileCount}</span>
                  <span>总大小：{formatBytes(folder.totalSize)}</span>
                  <span>最大文件：{folder.largestFile ? formatBytes(folder.largestFile.size) : "0 B"}</span>
                  <span>_READY.txt：{folder.ready ? "已存在" : "缺失"}</span>
                  <span>10GB+：{folder.largeFileCount}</span>
                  <span>50GB+：{folder.hugeFileCount}</span>
                </div>
                {folder.isImporting ? (
                  <div className={cn("rounded-md bg-blue-50 px-2 py-1 text-blue-700", skin.typography.meta)}>
                    已在处理中{folder.importingBatchId ? `：${folder.importingBatchId}` : ""}。
                  </div>
                ) : null}
                {!folder.ready ? (
                  <div className={cn("rounded-md bg-orange-50 px-2 py-1 text-orange-700", skin.typography.meta)}>
                    缺少 _READY.txt。请等拷贝完成后再创建标记文件。
                  </div>
                ) : null}
                {folder.warnings.map((warning) => (
                  <div key={warning} className={cn("rounded-md bg-amber-50 px-2 py-1 text-amber-800", skin.typography.meta)}>
                    {warning}
                  </div>
                ))}
                <ul className={cn("thin-scrollbar max-h-40 space-y-1 overflow-auto rounded-lg border bg-slate-50 p-3", skin.typography.path)}>
                  {folder.sampleFiles.map((file) => (
                    <li key={file.name} className="line-clamp-2 break-all">
                      {file.name} · {formatBytes(file.size)}{file.huge ? " · 50GB+" : file.large ? " · 10GB+" : ""}
                    </li>
                  ))}
                  {folder.fileCount > folder.sampleFiles.length ? (
                    <li className="text-muted-foreground">另有 {folder.fileCount - folder.sampleFiles.length} 个文件未展开。</li>
                  ) : null}
                </ul>
                <Button disabled={!folder.ready || Boolean(busyFolder) || activeBatchRunning || folder.isImporting || folder.fileCount === 0} onClick={() => startImport(folder.folderName)}>
                  {busyFolder === folder.folderName ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  {!folder.ready ? "等待 _READY.txt" : folder.isImporting ? "已在处理中" : activeBatchRunning ? "当前批次处理中" : "开始导入"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function BatchStatusPanel({
  detail,
  onRefresh,
  onRetryFailed
}: {
  detail: BatchDetailDto;
  onRefresh: () => void;
  onRetryFailed: () => void;
}) {
  const { summary, jobs } = detail;
  const failedJobs = jobs.filter((job) => job.status === "FAILED");

  return (
    <Card>
      <CardHeader>
        <CardTitle>导入批次状态</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className={cn("font-semibold text-primary", skin.typography.bodyDense)}>{detail.batch.batchId}</p>
              <p className={cn("mt-1", skin.typography.meta)}>{summary.statusText}</p>
            </div>
            <span className={batchStatusClass(summary.displayStatus)}>{summary.displayStatus}</span>
          </div>
          <div className={cn("mt-3 grid gap-2 sm:grid-cols-6", skin.typography.meta)}>
            <span>总数 {summary.total}</span>
            <span>排队 {summary.queued}</span>
            <span>处理中 {summary.running}</span>
            <span>成功 {summary.succeeded}</span>
            <span>待确认 {summary.needsReview}</span>
            <span>失败 {summary.failed}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            <RotateCw className="mr-2 h-4 w-4" /> 刷新状态
          </Button>
          <Button variant="secondary" size="sm" disabled={summary.retryable === 0} onClick={onRetryFailed}>
            <AlertCircle className="mr-2 h-4 w-4" /> 重试失败项（{summary.retryable}）
          </Button>
        </div>

        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.jobId} className={cn("rounded-lg border bg-white p-3", skin.typography.bodyDense)}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-primary">{job.originalFileName}</span>
                <span className={jobStatusClass(job.status)}>{jobStatusLabel(job.status)}</span>
                {job.materialId ? <span className={cn("rounded-md bg-slate-100 px-2 py-0.5 text-slate-600", skin.typography.badge)}>{job.materialId}</span> : null}
              </div>
              <div className={cn("mt-2 grid gap-1", skin.typography.meta)}>
                <p className="break-all">接收路径：{job.incomingRelativePath}</p>
                <p>尝试次数：{job.attempts ?? 0}</p>
                {job.lastError ? <p className="break-all text-red-700">失败原因：{job.lastError}</p> : null}
              </div>
            </div>
          ))}
          {jobs.length === 0 ? <p className={cn("text-muted-foreground", skin.typography.body)}>该批次暂无后台任务。</p> : null}
        </div>

        {failedJobs.length > 0 ? (
          <p className={cn("rounded-md bg-red-50 px-3 py-2 text-red-700", skin.typography.meta)}>
            失败项会保留原因，点击重试后重新进入后台队列。
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function isBatchActive(detail: BatchDetailDto | null) {
  if (!detail) return false;
  return detail.summary.queued > 0 || detail.summary.running > 0;
}

function isErrorMessage(message: string) {
  if (!message) return false;
  if (message.startsWith("已") || message.startsWith("正在") || message.includes("已重新加入")) return false;
  return ["失败", "缺少", "不可", "阻止", "错误", "没有可导入"].some((keyword) => message.includes(keyword));
}

function jobStatusLabel(status: ImportJobDto["status"]) {
  if (status === "QUEUED") return "等待后台处理";
  if (status === "RUNNING") return "后台处理中";
  if (status === "SUCCEEDED") return "处理完成";
  return "处理失败";
}

function jobStatusClass(status: ImportJobDto["status"]) {
  const base = "rounded-md px-2 py-0.5 text-[length:var(--skin-text-badge)] leading-[var(--skin-leading-badge)] font-medium";
  if (status === "SUCCEEDED") return `${base} bg-emerald-50 text-emerald-700`;
  if (status === "RUNNING") return `${base} bg-purple-50 text-purple-700`;
  if (status === "FAILED") return `${base} bg-red-50 text-red-700`;
  return `${base} bg-blue-50 text-blue-700`;
}

function batchStatusClass(status: string) {
  const base = "rounded-md px-2 py-0.5 text-[length:var(--skin-text-badge)] leading-[var(--skin-leading-badge)] font-medium";
  if (status === "IMPORTED") return `${base} bg-emerald-50 text-emerald-700`;
  if (status === "PROCESSING" || status === "UPLOADING") return `${base} bg-blue-50 text-blue-700`;
  if (status === "NEEDS_REVIEW") return `${base} bg-orange-50 text-orange-700`;
  if (status === "PARTIAL_FAILED" || status === "FAILED") return `${base} bg-red-50 text-red-700`;
  return `${base} bg-slate-100 text-slate-700`;
}

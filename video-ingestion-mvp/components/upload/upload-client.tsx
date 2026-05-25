"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, CloudUpload, Loader2, RotateCcw, UploadCloud, XCircle } from "lucide-react";

import type { MaterialDto } from "@/components/materials/types";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { UploadCategorySelect } from "@/components/upload/upload-category-select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fileTypeFromMime, FileTypeIcon } from "@/components/ui/file-type-icon";
import { Input } from "@/components/ui/input";
import { MediaPlaceholder } from "@/components/ui/media-placeholder";
import { MetricCard } from "@/components/ui/metric-card";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { ROOT_CATEGORY_OPTIONS, type UploadRootCategory } from "@/lib/storage/storage.constants";
import { cn, formatBytes, toLocalDateTime } from "@/lib/utils";

type UploadClientProps = {
  mode: "mobile" | "desktop";
  sourceType: "WEB_MOBILE_UPLOAD" | "WEB_DESKTOP_UPLOAD";
};

type UploadResult = {
  batchId: string;
  message: string;
  acceptedCount?: number;
  importedCount: number;
  failedCount: number;
  batch?: ImportBatchDto;
  summary?: BatchSummaryDto;
  jobs?: UploadJobDto[];
  materials?: MaterialDto[];
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

type RecentBatchDto = {
  batch: ImportBatchDto;
  summary: BatchSummaryDto;
};

type UploadJobDto = {
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

type ShooterDto = {
  id: string;
  name: string;
  displayName: string;
  status: string;
};

const { terminology: terms } = getRuntimeAppConfig();

type CategoryDto = {
  id: string;
  name: string;
  assetType: string;
  parentId?: string | null;
  relativePath?: string | null;
  status: string;
  allowUpload: boolean;
  depth: number;
  sortOrder: number;
  childCount?: number;
};

type UploadFileStatus = "pending" | "uploading" | "uploaded" | "failed" | "canceled";

type UploadQueueItem = {
  key: string;
  name: string;
  type: string;
  size: number;
  progress: number;
  status: UploadFileStatus;
  job?: UploadJobDto;
  error?: string;
};

type FileQueueSummary = {
  count: number;
  totalSize: number;
  items: UploadQueueItem[];
  previews: UploadQueueItem[];
  hiddenCount: number;
  uploadedCount: number;
};

type UploadMetadataPayload = {
  sourceType: UploadClientProps["sourceType"];
  uploaderName: string;
  shooterId: string;
  shooterName: string;
  categoryId: string;
  rootCategory: UploadRootCategory;
  subCategory: string;
  customTags: string;
  notes: string;
  manualAssetType: string;
  fileCount?: number;
  totalSize?: number;
};

const EMPTY_FILE_QUEUE: FileQueueSummary = {
  count: 0,
  totalSize: 0,
  items: [],
  previews: [],
  hiddenCount: 0,
  uploadedCount: 0
};

const FILE_QUEUE_PREVIEW_LIMIT = 6;

export function UploadClient({ mode, sourceType }: UploadClientProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Map<string, File>>(new Map());
  const itemsRef = useRef<UploadQueueItem[]>([]);
  const xhrsRef = useRef<Map<string, XMLHttpRequest>>(new Map());
  const uploadMetadataRef = useRef<UploadMetadataPayload | null>(null);
  const [uploadItems, setUploadItems] = useState<UploadQueueItem[]>([]);
  const [activeUploadBatchId, setActiveUploadBatchId] = useState("");
  const [shooters, setShooters] = useState<ShooterDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [shooterId, setShooterId] = useState("");
  const [shooterName, setShooterName] = useState("阿阳");
  const [categoryId, setCategoryId] = useState("");
  const [rootCategory, setRootCategory] = useState<UploadRootCategory>("AUTO");
  const [subCategory, setSubCategory] = useState("AUTO");
  const [customTags, setCustomTags] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [notes, setNotes] = useState("");
  const [manualAssetType, setManualAssetType] = useState("AUTO");
  const [showAddShooter, setShowAddShooter] = useState(false);
  const [newShooterName, setNewShooterName] = useState("");
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [recent, setRecent] = useState<MaterialDto[]>([]);
  const [recentBatches, setRecentBatches] = useState<RecentBatchDto[]>([]);
  const fileQueue = useMemo(() => summarizeUploadItems(uploadItems), [uploadItems]);

  async function loadRecent() {
    const response = await fetch("/api/materials", { cache: "no-store" });
    const data = (await response.json()) as { materials: MaterialDto[] };
    setRecent(data.materials.slice(0, mode === "mobile" ? 4 : 6));
  }

  async function loadShooters() {
    const response = await fetch("/api/shooters?active=1", { cache: "no-store" });
    const data = (await response.json()) as { shooters: ShooterDto[] };
    setShooters(data.shooters);
    const first = data.shooters[0];
    if (first && !shooterId) {
      setShooterId(first.id);
      setShooterName(first.displayName || first.name);
    }
  }

  async function loadCategories() {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    const data = (await response.json()) as { categories: CategoryDto[] };
    setCategories(data.categories || []);
  }

  async function loadRecentBatches() {
    const response = await fetch("/api/import-batches?limit=10", { cache: "no-store" });
    const data = (await response.json()) as { batches?: RecentBatchDto[] };
    setRecentBatches(data.batches || []);
  }

  useEffect(() => {
    loadRecent().catch(() => undefined);
    loadRecentBatches().catch(() => undefined);
    loadShooters().catch(() => undefined);
    loadCategories().catch(() => undefined);
  }, []);

  const hasActiveUploadJobs = Boolean(result?.jobs?.some((job) => job.status === "QUEUED" || job.status === "RUNNING"));

  useEffect(() => {
    if (!result?.batchId || !hasActiveUploadJobs) return;
    const timer = window.setInterval(() => {
      refreshBatch(result.batchId).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [result?.batchId, hasActiveUploadJobs]);

  async function refreshBatch(batchId: string) {
    const response = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      batch?: ImportBatchDto;
      summary?: BatchSummaryDto;
      jobs?: UploadJobDto[];
      materials?: MaterialDto[];
      error?: string;
    } | null;
    if (!response.ok || !data) {
      setError(data?.error || "刷新后台处理状态失败。");
      return;
    }
    setResult((current) => {
      const nextResult = {
        batchId,
        message: data.summary?.statusText || current?.message || "批次状态已刷新。",
        acceptedCount: data.summary?.received ?? current?.acceptedCount ?? 0,
        importedCount: data.summary?.succeeded ?? current?.importedCount ?? 0,
        failedCount: data.summary?.failed ?? current?.failedCount ?? 0,
        batch: data.batch || current?.batch,
        summary: data.summary || current?.summary,
        jobs: data.jobs || current?.jobs,
        materials: data.materials || current?.materials
      };
      return current && current.batchId !== batchId ? current : nextResult;
    });
    if (data.materials?.length) loadRecent().catch(() => undefined);
    loadRecentBatches().catch(() => undefined);
  }

  async function openBatch(batchId: string) {
    setError("");
    setProgress(0);
    const response = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as {
      batch?: ImportBatchDto;
      summary?: BatchSummaryDto;
      jobs?: UploadJobDto[];
      materials?: MaterialDto[];
      error?: string;
    } | null;
    if (!response.ok || !data) {
      setError(data?.error || "批次详情读取失败。");
      return;
    }
    setResult({
      batchId,
      message: data.summary?.statusText || "批次状态已读取。",
      acceptedCount: data.summary?.received ?? 0,
      importedCount: data.summary?.succeeded ?? 0,
      failedCount: data.summary?.failed ?? 0,
      batch: data.batch,
      summary: data.summary,
      jobs: data.jobs || [],
      materials: data.materials || []
    });
  }

  async function retryBatch(batchId: string, jobIds?: string[]) {
    setError("");
    const response = await fetch(`/api/import-batches/${encodeURIComponent(batchId)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobIds?.length ? { jobIds } : {})
    });
    const data = await response.json().catch(() => ({})) as { error?: string; skippedMissingSourceCount?: number; message?: string };
    if (!response.ok) {
      setError(data.error || "重试失败任务失败。");
      return;
    }
    if (data.skippedMissingSourceCount) {
      setError(data.message || `${data.skippedMissingSourceCount} 个任务源文件不存在，未重试。`);
    }
    await refreshBatch(batchId);
  }

  function appendFiles(nextFiles: FileList | File[]) {
    const incomingItems: UploadQueueItem[] = [];

    for (let index = 0; index < nextFiles.length; index += 1) {
      const file = nextFiles[index];
      if (!file) continue;

      const item = toUploadQueueItem(file);
      filesRef.current.set(item.key, file);
      incomingItems.push(item);
    }

    if (incomingItems.length === 0) return;
    setResult(null);
    setError("");
    setProgress(0);
    const nextItems = [...itemsRef.current, ...incomingItems];
    itemsRef.current = nextItems;
    setUploadItems(nextItems);
  }

  const clearSelectedFiles = useCallback(() => {
    for (const xhr of xhrsRef.current.values()) xhr.abort();
    xhrsRef.current.clear();
    filesRef.current.clear();
    uploadMetadataRef.current = null;
    itemsRef.current = [];
    setUploadItems([]);
    setActiveUploadBatchId("");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  async function upload() {
    const selectedItems = itemsRef.current.filter((item) => item.status === "pending");
    if (selectedItems.length === 0) {
      setError("请选择至少一个视频或图片。");
      return;
    }

    setIsUploading(true);
    setProgress(calculateAggregateProgress(itemsRef.current));
    setError("");

    try {
      const metadata = uploadMetadataRef.current || buildUploadMetadata();
      uploadMetadataRef.current = metadata;
      const batchId = activeUploadBatchId || await createUploadBatch(metadata);
      setActiveUploadBatchId(batchId);
      setResult((current) => current || {
        batchId,
        message: "批次已创建，正在逐个接收文件。",
        acceptedCount: 0,
        importedCount: 0,
        failedCount: 0,
        jobs: [],
        materials: []
      });

      await runUploadQueue(batchId, selectedItems.map((item) => item.key), mode === "mobile" ? 1 : 2, metadata);
      const latestItems = itemsRef.current;
      const failedCount = latestItems.filter((item) => item.status === "failed" || item.status === "canceled").length;
      const uploadedCount = latestItems.filter((item) => item.status === "uploaded").length;

      if (failedCount === 0 && uploadedCount === latestItems.length) {
        await completeUploadBatch(batchId);
      } else {
        setError(`有 ${failedCount} 个文件未接收。可重试单个文件，或结束批次仅处理已接收的 ${uploadedCount} 个文件。`);
        await refreshBatch(batchId);
      }
    } catch (error) {
      setError((error as Error).message || "上传失败，请检查文件和服务日志。");
    } finally {
      setIsUploading(false);
      setProgress(calculateAggregateProgress(itemsRef.current));
    }
  }

  async function createUploadBatch(metadata: UploadMetadataPayload) {
    const items = itemsRef.current;
    const response = await fetch("/api/upload-batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...metadata,
        fileCount: items.length,
        totalSize: items.reduce((sum, item) => sum + item.size, 0)
      })
    });
    const data = await response.json().catch(() => null) as { batchId?: string; error?: string } | null;
    if (!response.ok || !data?.batchId) {
      throw new Error(data?.error || "创建上传批次失败。");
    }
    return data.batchId;
  }

  async function runUploadQueue(batchId: string, itemKeys: string[], concurrency: number, metadata: UploadMetadataPayload) {
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < itemKeys.length) {
        const itemKey = itemKeys[nextIndex];
        nextIndex += 1;
        if (!itemKey) continue;
        await uploadSingleFile(batchId, itemKey, metadata);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, itemKeys.length) }, () => worker()));
  }

  function uploadSingleFile(batchId: string, itemKey: string, metadata = uploadMetadataRef.current || buildUploadMetadata()) {
    const file = filesRef.current.get(itemKey);
    const item = itemsRef.current.find((entry) => entry.key === itemKey);
    if (!file || !item || item.status === "uploaded" || item.status === "canceled") return Promise.resolve();

    const formData = new FormData();
    formData.append("file", file);
    appendUploadMetadata(formData, metadata);

    updateUploadItem(itemKey, { status: "uploading", progress: 0, error: undefined });

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrsRef.current.set(itemKey, xhr);
      xhr.open("POST", `/api/upload-batches/${encodeURIComponent(batchId)}/files`);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const nextProgress = Math.round((event.loaded / event.total) * 100);
        updateUploadItem(itemKey, { progress: nextProgress });
        setProgress(calculateAggregateProgress(itemsRef.current));
      };
      xhr.onload = () => {
        xhrsRef.current.delete(itemKey);
        const payload = parseJson(xhr.responseText) as { job?: UploadJobDto; error?: string } | null;
        if (xhr.status >= 400 || !payload?.job) {
          updateUploadItem(itemKey, {
            status: "failed",
            progress: 0,
            error: payload?.error || "文件上传失败。"
          });
          resolve();
          return;
        }
        const uploadedJob = payload.job;
        updateUploadItem(itemKey, { status: "uploaded", progress: 100, job: uploadedJob, error: undefined });
        setResult((current) => mergeUploadedJobResult(current, batchId, uploadedJob));
        resolve();
      };
      xhr.onerror = () => {
        xhrsRef.current.delete(itemKey);
        updateUploadItem(itemKey, { status: "failed", progress: 0, error: "网络中断，文件上传失败。" });
        resolve();
      };
      xhr.onabort = () => {
        xhrsRef.current.delete(itemKey);
        updateUploadItem(itemKey, { status: "canceled", progress: 0, error: "已取消上传。" });
        resolve();
      };
      xhr.send(formData);
    });
  }

  async function completeUploadBatch(batchId = activeUploadBatchId) {
    if (!batchId) return;
    setError("");
    const response = await fetch(`/api/upload-batches/${encodeURIComponent(batchId)}/complete`, { method: "POST" });
    const data = await response.json().catch(() => null) as (UploadResult & { error?: string }) | null;
    if (!response.ok || !data) {
      setError(data?.error || "结束上传批次失败。");
      return;
    }
    setResult({ ...data, message: "文件已接收，后台入库正在继续处理" });
    setProgress(100);
    setActiveUploadBatchId("");
    uploadMetadataRef.current = null;
    loadRecent().catch(() => undefined);
    loadRecentBatches().catch(() => undefined);
    refreshBatch(batchId).catch(() => undefined);
  }

  async function retryUploadItem(itemKey: string) {
    const batchId = activeUploadBatchId || result?.batchId;
    if (!batchId) {
      setError("请先点击上传创建批次。");
      return;
    }
    setIsUploading(true);
    setError("");
    updateUploadItem(itemKey, { status: "pending", progress: 0, error: undefined });
    await uploadSingleFile(batchId, itemKey);
    setIsUploading(false);
    setProgress(calculateAggregateProgress(itemsRef.current));
    const latestItems = itemsRef.current;
    if (latestItems.length > 0 && latestItems.every((item) => item.status === "uploaded")) {
      await completeUploadBatch(batchId);
    }
  }

  function cancelUploadItem(itemKey: string) {
    const xhr = xhrsRef.current.get(itemKey);
    if (xhr) {
      xhr.abort();
      return;
    }
    updateUploadItem(itemKey, { status: "canceled", progress: 0, error: "已取消上传。" });
  }

  function updateUploadItem(itemKey: string, patch: Partial<UploadQueueItem>) {
    const next = itemsRef.current.map((item) => (
      item.key === itemKey ? { ...item, ...patch } : item
    ));
    itemsRef.current = next;
    setUploadItems(next);
  }

  function buildUploadMetadata(extra?: { fileCount?: number; totalSize?: number }): UploadMetadataPayload {
    return {
      sourceType,
      uploaderName: shooterName,
      shooterId,
      shooterName,
      categoryId,
      rootCategory,
      subCategory,
      customTags,
      notes,
      manualAssetType: mode === "desktop" ? manualAssetType : "AUTO",
      ...extra
    };
  }

  function appendUploadMetadata(formData: FormData, metadata: UploadMetadataPayload) {
    for (const [key, value] of Object.entries(metadata)) {
      formData.append(key, String(value));
    }
  }

  async function quickAddShooter() {
    const name = newShooterName.trim();
    if (!name) {
      setError("请输入新拍摄人名称。");
      return;
    }
    const response = await fetch("/api/shooters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, displayName: name })
    });
    const data = (await response.json()) as { shooter?: ShooterDto; error?: string };
    if (!response.ok || !data.shooter) {
      setError(data.error || "新增拍摄人失败。");
      return;
    }
    await loadShooters();
    setShooterId(data.shooter.id);
    setShooterName(data.shooter.displayName || data.shooter.name);
    setNewShooterName("");
    setShowAddShooter(false);
  }

  function changeCategory(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    const category = categories.find((item) => item.id === nextCategoryId);
    if (!category) {
      setRootCategory("AUTO");
      setSubCategory("AUTO");
      return;
    }
    setRootCategory(rootCategoryForAssetType(category.assetType));
    setSubCategory(category.relativePath || "AUTO");
  }

  const settings = (
    <Panel className="space-y-4 lg:sticky lg:top-[calc(var(--skin-header-height)+var(--skin-content-gap))] lg:self-start">
      <SectionHeading
        title={terms.upload.settings}
        description={`${terms.shooter.singular}、入库目录和补充信息会随批次进入后台处理。`}
      />
      <div className="space-y-4">
        <UploadCategorySelect
          categories={categories}
          value={categoryId}
          onChange={changeCategory}
          label={terms.ingestion.category}
        />
        <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
          {terms.shooter.singular}
          <Select
            value={shooterId}
            onChange={(event) => {
              if (event.target.value === "__ADD__") {
                setShowAddShooter(true);
                return;
              }
              const shooter = shooters.find((item) => item.id === event.target.value);
              setShooterId(event.target.value);
              setShooterName(shooter?.displayName || shooter?.name || "");
            }}
          >
            {shooters.map((shooter) => (
              <option key={shooter.id} value={shooter.id}>{shooter.displayName || shooter.name}</option>
            ))}
            <option value="__ADD__">+ 添加{terms.shooter.singular}</option>
          </Select>
          {showAddShooter ? (
            <Surface tone="muted" padding="sm" className="mt-2">
              <p className={cn("mb-2", skin.typography.meta)}>快速添加{terms.shooter.singular}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={newShooterName} onChange={(event) => setNewShooterName(event.target.value)} placeholder="例如 阿阳" />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={quickAddShooter}>添加</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddShooter(false)}>取消</Button>
                </div>
              </div>
            </Surface>
          ) : null}
        </label>
        <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
          备注
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="补充拍摄场景、主体、用途，能提升 mock/AI 判断质量。" />
        </label>
        <button type="button" className={cn("text-left font-semibold text-primary", skin.typography.badge)} onClick={() => setShowMore((value) => !value)}>
          {showMore ? "收起更多信息" : "更多信息：自定义标签"}
        </button>
        {showMore ? (
          <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
            自定义标签
            <Input value={customTags} onChange={(event) => setCustomTags(event.target.value)} placeholder="逗号分隔，例如 秋田犬,展会,可爱" />
          </label>
        ) : null}
      </div>
    </Panel>
  );

  const uploadZone = (
    <Panel padding="sm" className="h-full">
      <div
        className={cn(
          "flex min-h-[var(--skin-upload-dropzone-min-height)] flex-col items-center justify-center rounded-[var(--skin-radius-section)] border border-dashed p-5 text-center transition sm:p-6",
          isDragOver
            ? "border-primary bg-[color:var(--skin-surface-selected)]"
            : "border-[color:var(--skin-border-strong)] bg-[color:var(--skin-muted-bg)]"
        )}
        onDragOver={(event) => {
          if (mode !== "desktop") return;
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          if (mode !== "desktop") return;
          event.preventDefault();
          setIsDragOver(false);
          appendFiles(event.dataTransfer.files);
        }}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--skin-radius-panel)] bg-[color:var(--skin-surface-selected)] text-primary ring-1 ring-emerald-100">
          <CloudUpload className="h-7 w-7" />
        </div>
        <div className="mb-3 flex flex-wrap justify-center gap-2">
          <StatusPill tone="info" withDot>文件先进入本机待处理区</StatusPill>
          <StatusPill tone="processing" withDot>后台继续抽帧和 AI 识别</StatusPill>
        </div>
        <p className={skin.typography.sectionTitle}>{mode === "mobile" ? "点击选择视频或图片" : "拖拽文件到这里"}</p>
        <p className={cn("mt-1 max-w-2xl", skin.typography.body, "text-muted-foreground")}>支持 MP4、MOV、JPG、PNG 等。视频只抽关键帧，不把完整视频发给 AI。</p>
        <Input ref={inputRef} className="mt-5 min-h-[var(--skin-touch-target-min-height)] max-w-md cursor-pointer bg-[color:var(--skin-surface-input)]" type="file" accept="video/*,image/*" multiple onChange={(event) => event.target.files && appendFiles(event.target.files)} />
        {fileQueue.count ? (
          <p className={cn("mt-3", skin.typography.meta)}>
            已选择 {fileQueue.count} 个文件，共 {formatBytes(fileQueue.totalSize)}。
          </p>
        ) : null}
        <Button className={cn("mt-4 max-w-md", skin.responsive.uploadPrimaryAction)} size="lg" disabled={isUploading || fileQueue.count === 0} onClick={upload}>
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          {isUploading ? `正在${terms.upload.noun}...` : `${terms.upload.noun}到待${terms.ingestion.noun}队列`}
        </Button>
      </div>
    </Panel>
  );

  return (
    <div className={skin.responsive.uploadContent} style={skin.vars}>
      {mode === "desktop" ? (
        <div className={skin.responsive.uploadShell}>
          {settings}
          {uploadZone}
        </div>
      ) : (
        <div className="space-y-4">
          {settings}
          {uploadZone}
        </div>
      )}

      {(isUploading || progress > 0 || result || error) ? (
        <Panel className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className={skin.typography.sectionTitle}>{terms.upload.progress}</h2>
              <p className={cn("mt-1", skin.typography.meta)}>浏览器上传只表示文件传输进度；后台入库状态在批次详情里继续更新。</p>
            </div>
            <StatusPill tone={isUploading ? "processing" : result ? "success" : error ? "danger" : "neutral"} withDot>
              {isUploading ? "上传中" : result ? "文件已接收" : error ? "需要处理" : "待上传"}
            </StatusPill>
          </div>
          <ProgressBar value={progress} />
          {error ? (
            <Surface tone="muted" padding="sm" className="border-red-100 bg-red-50/60">
              <div className={cn("flex flex-wrap items-center gap-2", skin.typography.body)}>
                <StatusPill tone="danger" withDot>错误</StatusPill>
                <span className="text-red-700">{error}</span>
              </div>
            </Surface>
          ) : null}
          {result ? (
            <UploadResultPanel
              result={result}
              onRefresh={() => refreshBatch(result.batchId)}
              onRetry={(jobIds) => retryBatch(result.batchId, jobIds)}
              onContinue={() => {
                setResult(null);
                setProgress(0);
                setError("");
                clearSelectedFiles();
              }}
            />
          ) : null}
        </Panel>
      ) : null}

      <div className={mode === "desktop" ? skin.responsive.uploadTaskGrid : "space-y-4"}>
        <FileQueuePanel
          queue={fileQueue}
          isUploading={isUploading}
          progress={progress}
          mode={mode}
          canComplete={Boolean(activeUploadBatchId) && fileQueue.uploadedCount > 0}
          onClear={clearSelectedFiles}
          onCancel={cancelUploadItem}
          onRetry={retryUploadItem}
          onComplete={() => completeUploadBatch()}
        />
        <RecentBatchesPanel batches={recentBatches} onOpen={openBatch} compact={mode === "mobile" && Boolean(result)} />
      </div>

      {mode === "desktop" ? (
        <Panel padding="none" className="overflow-hidden">
          <div className="border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)]">
            <h2 className={skin.typography.panelTitle}>{terms.upload.recent}</h2>
            <p className={cn("mt-1", skin.typography.meta)}>最近{terms.upload.noun}记录用于快速确认素材是否进入系统。</p>
          </div>
          <div className="p-[var(--skin-panel-padding)]">
            <RecentList materials={recent} />
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function toUploadQueueItem(file: File): UploadQueueItem {
  return {
    key: `${crypto.randomUUID()}-${file.name}-${file.size}-${file.lastModified}`,
    name: file.name,
    type: file.type,
    size: file.size,
    progress: 0,
    status: "pending"
  };
}

function summarizeUploadItems(items: UploadQueueItem[]): FileQueueSummary {
  const previews = items.slice(0, FILE_QUEUE_PREVIEW_LIMIT);
  let totalSize = 0;
  let uploadedCount = 0;
  for (const item of items) {
    totalSize += item.size;
    if (item.status === "uploaded") uploadedCount += 1;
  }
  return {
    count: items.length,
    totalSize,
    items,
    previews,
    hiddenCount: Math.max(0, items.length - previews.length),
    uploadedCount
  };
}

function calculateAggregateProgress(items: UploadQueueItem[]) {
  if (items.length === 0) return 0;
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);
  if (totalSize === 0) return 0;
  const loadedSize = items.reduce((sum, item) => {
    const progress = item.status === "uploaded" ? 100 : item.progress;
    return sum + (item.size * progress) / 100;
  }, 0);
  return Math.round((loadedSize / totalSize) * 100);
}

function parseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function mergeUploadedJobResult(current: UploadResult | null, batchId: string, job: UploadJobDto): UploadResult {
  const jobs = current?.jobs?.filter((item) => item.jobId !== job.jobId) || [];
  const nextJobs = [...jobs, job];
  return {
    batchId,
    message: "文件正在逐个接收。",
    acceptedCount: nextJobs.length,
    importedCount: current?.importedCount ?? 0,
    failedCount: current?.failedCount ?? 0,
    batch: current?.batch,
    summary: current?.summary,
    jobs: nextJobs,
    materials: current?.materials || []
  };
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className={skin.typography.panelTitle}>{title}</h2>
      {description ? <p className={cn("mt-1", skin.typography.meta)}>{description}</p> : null}
    </div>
  );
}

function ProgressBar({ value, compact = false }: { value: number; compact?: boolean }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1.5">
      {!compact ? (
        <div className={cn("flex items-center justify-between", skin.typography.meta)}>
          <span>浏览器上传</span>
          <span>{width}%</span>
        </div>
      ) : null}
      <div className={cn("overflow-hidden rounded-[var(--skin-radius-full)] bg-[color:var(--skin-surface-subtle)]", compact ? "h-1.5" : "h-2")}>
        <div className="h-full rounded-[var(--skin-radius-full)] bg-primary transition-all" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function UploadResultPanel({
  result,
  onRefresh,
  onRetry,
  onContinue
}: {
  result: UploadResult;
  onRefresh: () => void;
  onRetry: (jobIds?: string[]) => void;
  onContinue: () => void;
}) {
  const materials = result.materials || [];
  const jobs = result.jobs || [];
  const summary = result.summary;
  const queuedJobs = jobs.filter((job) => job.status === "QUEUED");
  const runningJobs = jobs.filter((job) => job.status === "RUNNING");
  const succeededJobs = jobs.filter((job) => job.status === "SUCCEEDED");
  const failedJobs = jobs.filter((job) => job.status === "FAILED");
  const successfulMaterials = materials.filter((material) => ["READY", "IMPORTED"].includes(material.status));
  const reviewMaterials = materials.filter((material) => material.status === "NEEDS_REVIEW");
  const failedMaterials = materials.filter((material) => material.status === "FAILED");
  const activeJobs = queuedJobs.length + runningJobs.length;
  const received = summary?.received ?? result.acceptedCount ?? result.importedCount;
  const total = summary?.total ?? result.acceptedCount ?? result.importedCount;
  const batchTone = batchStatusTone(summary?.displayStatus || result.batch?.status || "");

  return (
    <Surface tone="raised" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)]", skin.status.success.background, skin.status.success.text)}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{result.message}</p>
              <StatusPill tone="info">浏览器已完成接收</StatusPill>
              <StatusPill tone={batchTone}>{batchStatusLabel(summary?.displayStatus || result.batch?.status || "PROCESSING")}</StatusPill>
            </div>
            <p className={cn("mt-1 break-all", skin.typography.meta)}>批次 {result.batchId}</p>
            <p className={cn("mt-2", skin.typography.body, "text-muted-foreground")}>
              文件已接收 {received}/{total} 个；后台入库成功 {summary?.succeeded ?? result.importedCount} 个，失败 {summary?.failed ?? result.failedCount} 个。
            </p>
            <p className={cn("mt-1", skin.typography.meta)}>
              “文件已接收”只表示原文件已进入本机待处理区；抽帧、AI 识别和最终入库会在后台继续处理。
            </p>
          </div>
        </div>
        <StatusPill tone={batchTone} withDot>{summary?.displayStatus || result.batch?.status || "已接收"}</StatusPill>
      </div>

      <div className="space-y-3">
        <SummaryGrid summary={summary} />
        <JobGroup title="等待后台处理" jobs={queuedJobs} />
        <JobGroup title="后台处理中" jobs={runningJobs} />
        <MaterialGroup title="入库成功" materials={successfulMaterials} />
        <MaterialGroup title="需要人工确认" materials={reviewMaterials} />
        <JobGroup title="处理失败，可重试" jobs={failedJobs} showErrors onRetryJob={(jobId) => onRetry([jobId])} />
        <MaterialGroup title="失败素材记录" materials={failedMaterials} showFailedReason />
        {succeededJobs.length > 0 && successfulMaterials.length === 0 ? (
          <JobGroup title="处理完成" jobs={succeededJobs} />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm" onClick={onRefresh}>
          刷新后台状态{activeJobs ? `（处理中 ${activeJobs}）` : ""}
        </Button>
        {(summary?.retryable || failedJobs.length) > 0 ? (
          <Button className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm" onClick={() => onRetry()}>
            重试失败项（{summary?.retryable || failedJobs.length}）
          </Button>
        ) : null}
        <Button asChild className="min-h-[var(--skin-touch-target-min-height)]" size="sm">
          <Link href="/admin">返回工作台</Link>
        </Button>
        <Button asChild className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm">
          <Link href="/admin/ingest-review">查看{terms.ingestion.queue}</Link>
        </Button>
        <Button asChild className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm">
          <Link href="/admin/library">打开{terms.library.noun}</Link>
        </Button>
        <Button className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm" onClick={onContinue}>
          继续{terms.upload.noun}
        </Button>
      </div>
    </Surface>
  );
}

function SummaryGrid({ summary }: { summary?: BatchSummaryDto }) {
  if (!summary) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="文件已接收" value={`${summary.received}/${summary.total}`} icon={UploadCloud} tone="info" />
      <MetricCard label="后台处理中" value={summary.queued + summary.running} icon={Clock3} tone="processing" />
      <MetricCard label={`后台${terms.ingestion.success}`} value={summary.succeeded} icon={CheckCircle2} tone="success" />
      <MetricCard label="失败 / 可重试" value={`${summary.failed} / ${summary.retryable}`} icon={AlertTriangle} tone={summary.failed > 0 ? "danger" : "neutral"} />
    </div>
  );
}

const FileQueuePanel = memo(function FileQueuePanel({
  queue,
  isUploading,
  progress,
  mode,
  canComplete,
  onClear,
  onCancel,
  onRetry,
  onComplete
}: {
  queue: FileQueueSummary;
  isUploading: boolean;
  progress: number;
  mode: "mobile" | "desktop";
  canComplete: boolean;
  onClear: () => void;
  onCancel: (itemKey: string) => void;
  onRetry: (itemKey: string) => void;
  onComplete: () => void;
}) {
  const hasFiles = queue.count > 0;

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={skin.typography.panelTitle}>{mode === "mobile" ? "待上传文件" : terms.upload.fileList}</h2>
          <p className={cn("mt-1", skin.typography.meta)}>
            {hasFiles ? "这里显示浏览器已选择的文件，点击上传后才会进入本机待处理区。" : "选择视频或图片后，文件会先在这里排队。"}
          </p>
        </div>
        {hasFiles ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="info">{queue.count} 个 · {formatBytes(queue.totalSize)}</StatusPill>
            <Button type="button" variant="secondary" size="sm" disabled={isUploading} onClick={onClear}>
              清空已选
            </Button>
            {canComplete ? (
              <Button type="button" variant="secondary" size="sm" disabled={isUploading} onClick={onComplete}>
                结束批次
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="p-[var(--skin-panel-padding)]">
        {hasFiles ? (
          mode === "mobile" ? (
            <div className="space-y-2">
              {queue.previews.map((file) => (
                <div key={file.key} className={cn(skin.listItem, "p-3")}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] bg-[color:var(--skin-surface-subtle)] text-muted-foreground">
                      <FileTypeIcon type={fileTypeFromMime(file.type)} className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("line-clamp-2 break-words font-medium", skin.typography.cardTitle)}>{file.name}</p>
                      <div className={cn("mt-2 flex flex-wrap items-center gap-2", skin.typography.meta)}>
                        <span>{formatBytes(file.size)}</span>
                        <StatusPill tone={uploadFileStatusTone(file.status)}>{uploadFileStatusLabel(file.status, file.progress)}</StatusPill>
                      </div>
                      {file.error ? <p className={cn("mt-2 text-red-700", skin.typography.meta)}>{file.error}</p> : null}
                    </div>
                  </div>
                  <div className="mt-3"><ProgressBar value={file.progress} compact /></div>
                  <FileUploadActions item={file} isUploading={isUploading} onCancel={onCancel} onRetry={onRetry} />
                </div>
              ))}
              {queue.hiddenCount > 0 ? (
                <Surface tone="muted" padding="sm" className={cn("text-center", skin.typography.meta)}>
                  还有 {queue.hiddenCount} 个文件已加入队列，上传时会继续逐个处理。
                </Surface>
              ) : null}
            </div>
          ) : (
            <ResponsiveTableShell>
              <table className={cn("w-full", skin.typography.tableCell)}>
                <thead className={skin.table.header}>
                  <tr>
                    <th className="px-3 py-2 text-left">文件名</th>
                    <th className="px-3 py-2 text-left">大小</th>
                    <th className="px-3 py-2 text-left">进度</th>
                    <th className="px-3 py-2 text-left">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.previews.map((file) => (
                    <tr key={file.key} className={skin.table.row}>
                      <td className="max-w-[360px] px-3 py-2"><span className="line-clamp-2 break-all">{file.name}</span></td>
                      <td className={cn("whitespace-nowrap px-3 py-2", skin.typography.meta)}>{formatBytes(file.size)}</td>
                      <td className="min-w-[140px] px-3 py-2">
                        <ProgressBar value={file.progress} compact />
                        <p className={cn("mt-1", skin.typography.meta)}>{file.progress}%</p>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-2">
                          <StatusPill tone={uploadFileStatusTone(file.status)}>{uploadFileStatusLabel(file.status, file.progress)}</StatusPill>
                          {file.error ? <span className={cn("text-red-700", skin.typography.meta)}>{file.error}</span> : null}
                          <FileUploadActions item={file} isUploading={isUploading} onCancel={onCancel} onRetry={onRetry} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {queue.hiddenCount > 0 ? (
                    <tr className={skin.table.row}>
                      <td colSpan={4} className={cn("px-3 py-3 text-center", skin.typography.meta)}>
                        还有 {queue.hiddenCount} 个文件已加入队列，上传时会继续逐个处理。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <div className={cn("border-t border-[color:var(--skin-border-subtle)] bg-[color:var(--skin-surface-table-header)] px-3 py-2", skin.typography.meta)}>
                共 {queue.count} 个文件，{formatBytes(queue.totalSize)}
                {hasFiles ? `；总体上传 ${progress}%` : ""}
              </div>
            </ResponsiveTableShell>
          )
        ) : (
          <EmptyState
            icon={UploadCloud}
            title="尚未选择文件"
            description="选择视频或图片后，可以在这里确认文件名、大小和等待状态。"
            className="min-h-40 p-6"
          />
        )}
      </div>
    </Panel>
  );
});

function FileUploadActions({
  item,
  isUploading,
  onCancel,
  onRetry
}: {
  item: UploadQueueItem;
  isUploading: boolean;
  onCancel: (itemKey: string) => void;
  onRetry: (itemKey: string) => void;
}) {
  if (item.status === "uploaded") return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {item.status === "uploading" || item.status === "pending" ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => onCancel(item.key)}>
          <XCircle className="mr-1.5 h-3.5 w-3.5" />
          取消
        </Button>
      ) : null}
      {item.status === "failed" || item.status === "canceled" ? (
        <Button type="button" variant="secondary" size="sm" disabled={isUploading} onClick={() => onRetry(item.key)}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          重试
        </Button>
      ) : null}
    </div>
  );
}

function uploadFileStatusLabel(status: UploadFileStatus, progress: number) {
  if (status === "uploading") return `上传中 ${progress}%`;
  if (status === "uploaded") return "已接收";
  if (status === "failed") return "上传失败";
  if (status === "canceled") return "已取消";
  return "等待上传";
}

function uploadFileStatusTone(status: UploadFileStatus): SkinStatusTone {
  if (status === "uploading") return "processing";
  if (status === "uploaded") return "success";
  if (status === "failed") return "danger";
  if (status === "canceled") return "warning";
  return "neutral";
}

function JobGroup({
  title,
  jobs,
  showErrors = false,
  onRetryJob
}: {
  title: string;
  jobs: UploadJobDto[];
  showErrors?: boolean;
  onRetryJob?: (jobId: string) => void;
}) {
  if (!jobs.length) return null;
  return (
    <section className="space-y-2">
      <p className={cn("font-semibold", skin.typography.meta)}>{title}（{jobs.length}）</p>
      {jobs.map((job) => (
        <div key={job.jobId} className={cn(skin.listItem, "p-3", skin.typography.bodyDense)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words font-semibold text-primary">{job.originalFileName}</span>
            <StatusPill tone={jobStatusTone(job.status)}>{jobStatusLabel(job.status)}</StatusPill>
            <StatusPill tone="neutral">{sourceLabel(job.sourceType)}</StatusPill>
          </div>
          <div className="mt-3 grid gap-2">
            <PathLine label="文件大小" value={formatBytes(job.fileSize)} />
            <PathLine label="初始接收位置" value={job.incomingRelativePath || "-"} />
            <PathLine label="后台任务 ID" value={job.jobId} />
            {job.materialId ? <PathLine label={`生成${terms.material.idLabel}`} value={job.materialId} /> : null}
            {showErrors && job.lastError ? <PathLine label="失败原因" value={job.lastError} /> : null}
          </div>
          {onRetryJob ? (
            <Button className="mt-3 min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm" onClick={() => onRetryJob(job.jobId)}>
              重试该文件
            </Button>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function MaterialGroup({
  title,
  materials,
  showFailedReason = false
}: {
  title: string;
  materials: MaterialDto[];
  showFailedReason?: boolean;
}) {
  if (!materials.length) return null;
  return (
    <section className="space-y-2">
      <p className={cn("font-semibold", skin.typography.meta)}>{title}（{materials.length}）</p>
      {materials.map((material) => (
        <div key={material.id} className={cn(skin.listItem, "p-3", skin.typography.bodyDense)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-primary">{material.materialId}</span>
            <StatusPill tone={materialStatusTone(material.status)}>{materialStatusLabel(material.status)}</StatusPill>
            <StatusPill tone="neutral">{sourceLabel(material.ingestSource)}</StatusPill>
          </div>
          <div className="mt-3 grid gap-2">
            <PathLine label="原始文件名" value={material.originalFileName} />
            <PathLine label="当前文件名" value={material.storedFileName} />
            <PathLine label="初始接收位置" value={material.originalPath || "-"} />
            <PathLine label="当前文件位置" value={material.relativePath} />
            <PathLine label="完整本地路径" value={material.absolutePath || "-"} />
            {showFailedReason ? <PathLine label="失败原因" value={readMaterialFailure(material)} /> : null}
          </div>
          {material.status === "NEEDS_REVIEW" ? (
            <Surface tone="muted" padding="sm" className={cn("mt-3 border-amber-100 bg-amber-50/60 text-amber-800", skin.typography.meta)}>
              该{terms.material.singular}已{terms.upload.noun}并完成 AI 处理，当前需要在{terms.ingestion.queue}确认后进入{terms.library.noun}。
            </Surface>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function readMaterialFailure(material: MaterialDto) {
  const aiResult = material.aiResult as { error?: unknown } | null | undefined;
  return typeof aiResult?.error === "string" ? aiResult.error : "处理失败，详情见后台任务失败原因。";
}

function PathLine({ label, value }: { label: string; value: string }) {
  return (
    <Surface tone="muted" padding="sm" className="rounded-[var(--skin-radius-control)]">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-0.5 break-all font-medium", skin.typography.path, "text-foreground")}>{value}</p>
    </Surface>
  );
}

function sourceLabel(source?: string) {
  if (source === "WEB_MOBILE_UPLOAD") return "手机上传";
  if (source === "WEB_DESKTOP_UPLOAD") return "电脑上传";
  if (source === "DEVICE_IMPORT") return "设备导入";
  if (source === "MANUAL_IMPORT") return "手动导入";
  return source || "未知来源";
}

function jobStatusLabel(status: UploadJobDto["status"]) {
  if (status === "QUEUED") return "等待后台处理";
  if (status === "RUNNING") return "后台处理中";
  if (status === "SUCCEEDED") return "处理完成";
  return "处理失败";
}

function jobStatusTone(status: UploadJobDto["status"]): SkinStatusTone {
  if (status === "SUCCEEDED") return "success";
  if (status === "RUNNING") return "processing";
  if (status === "FAILED") return "danger";
  return "info";
}

function RecentBatchesPanel({
  batches,
  onOpen,
  compact = false
}: {
  batches: RecentBatchDto[];
  onOpen: (batchId: string) => void;
  compact?: boolean;
}) {
  const visibleBatches = compact ? batches.slice(0, 3) : batches;

  return (
    <Panel padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-[color:var(--skin-border-subtle)] p-[var(--skin-panel-padding)] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={skin.typography.panelTitle}>最近批次</h2>
          <p className={cn("mt-1", skin.typography.meta)}>点击批次可重新打开处理详情，跟踪已接收、后台完成、待确认和失败数量。</p>
        </div>
        {compact ? <StatusPill tone="neutral">最近 {visibleBatches.length}</StatusPill> : null}
      </div>
      <div className="p-[var(--skin-panel-padding)]">
        {visibleBatches.length ? (
          <div className="space-y-2">
            {visibleBatches.map(({ batch, summary }) => (
              <button
                key={batch.batchId}
                type="button"
                className={cn(skin.listItem, "w-full p-3 text-left")}
                onClick={() => onOpen(batch.batchId)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("truncate font-semibold text-primary", skin.typography.bodyDense)}>{batch.batchId}</p>
                    <p className={cn("mt-1", skin.typography.meta)}>
                      {sourceLabel(batch.sourceType)} · {toLocalDateTime(batch.createdAt)} · {formatBytes(batch.totalSize)}
                    </p>
                  </div>
                  <StatusPill tone={batchStatusTone(summary.displayStatus)} withDot>{batchStatusLabel(summary.displayStatus)}</StatusPill>
                </div>
                <div className={cn("mt-3 grid gap-2", skin.typography.meta, compact ? "grid-cols-2" : "sm:grid-cols-4")}>
                  <BatchMetric label="已接收" value={`${summary.received}/${summary.total}`} />
                  <BatchMetric label="后台完成" value={String(summary.succeeded)} />
                  <BatchMetric label="待确认" value={String(summary.needsReview)} tone="review" />
                  <BatchMetric label="失败" value={String(summary.failed)} tone={summary.failed > 0 ? "danger" : "neutral"} />
                </div>
                <div className="mt-3">
                  <ProgressBar value={summary.total ? Math.round((summary.received / summary.total) * 100) : 0} compact />
                </div>
                <p className={cn("mt-2", skin.typography.meta)}>{summary.statusText}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={Clock3}
            title="暂无可追踪批次"
            description="完成上传或打开历史批次后，这里会显示后台处理状态。"
          />
        )}
      </div>
    </Panel>
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

function batchStatusTone(status: string): SkinStatusTone {
  if (["IMPORTED", "SUCCEEDED", "READY"].includes(status)) return "success";
  if (["PROCESSING", "UPLOADING", "RUNNING", "QUEUED"].includes(status)) return "processing";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "PARTIAL_FAILED") return "warning";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function batchStatusLabel(status: string) {
  if (status === "IMPORTED") return "已入库";
  if (status === "PROCESSING") return "后台处理中";
  if (status === "UPLOADING") return "接收中";
  if (status === "NEEDS_REVIEW") return "待确认";
  if (status === "PARTIAL_FAILED") return "部分失败";
  if (status === "FAILED") return "失败";
  return status || "已接收";
}

function materialStatusTone(status: string): SkinStatusTone {
  if (["READY", "IMPORTED"].includes(status)) return "success";
  if (["UPLOADED", "PROCESSING", "AI_TAGGED"].includes(status)) return "processing";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "FAILED") return "danger";
  if (status === "TRASHED") return "neutral";
  return "neutral";
}

function materialStatusLabel(status: string) {
  if (status === "READY") return "已入库";
  if (status === "IMPORTED") return "已导入";
  if (status === "UPLOADED") return "已接收";
  if (status === "PROCESSING") return "处理中";
  if (status === "AI_TAGGED") return "AI 已识别";
  if (status === "NEEDS_REVIEW") return "待确认";
  if (status === "FAILED") return "失败";
  if (status === "TRASHED") return "回收站";
  return status;
}

function RecentList({ materials }: { materials: MaterialDto[] }) {
  if (!materials.length) {
    return (
      <EmptyState
        compact
        icon={UploadCloud}
        title="暂无最近上传记录"
        description="文件进入系统后会显示在这里，方便快速确认入库结果。"
      />
    );
  }

  return (
    <div className="space-y-2">
      {materials.map((material) => (
        <div key={material.id} className={cn(skin.listItem, "flex items-center gap-3 p-2")}>
          <div
            className="h-12 overflow-hidden rounded-[var(--skin-radius-sm)] bg-[color:var(--skin-surface-subtle)]"
            style={{
              aspectRatio: getMaterialAspectRatio(material),
              width: isVerticalMaterial(material) ? 30 : 64
            }}
          >
            {material.thumbnailPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-full w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
            ) : (
              <MediaPlaceholder type={fileTypeFromMime(material.mimeType)} label="" size="sm" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={cn("line-clamp-2 break-words font-medium", skin.typography.cardTitle)}>{material.storedFileName}</p>
            <p className={skin.typography.meta}>{material.materialId} · {toLocalDateTime(material.createdAt)}</p>
          </div>
          <StatusPill tone={materialStatusTone(material.status)}>{materialStatusLabel(material.status)}</StatusPill>
        </div>
      ))}
    </div>
  );
}

function rootCategoryForAssetType(assetType: string): UploadRootCategory {
  return ROOT_CATEGORY_OPTIONS.find((item) => item.assetType === assetType)?.value || "AUTO";
}

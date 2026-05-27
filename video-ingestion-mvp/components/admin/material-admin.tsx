"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Grid2X2, List, RefreshCcw, RotateCcw, Search, X } from "lucide-react";

import { ActionToolbar, type MaterialActions } from "@/components/materials/action-toolbar";
import { CategoryCascadeFilter, type CategoryNodeDto } from "@/components/materials/category-cascade-filter";
import { MaterialCard } from "@/components/materials/material-card";
import { MaterialDetailDrawer } from "@/components/materials/material-detail-drawer";
import { MaterialDetailList } from "@/components/materials/material-detail-list";
import { MATERIAL_ISSUE_OPTIONS } from "@/components/materials/material-issue-badges";
import {
  ConfirmMaterialDialog,
  EditTagsDialog,
  MoveMaterialDialog,
  RenameMaterialDialog
} from "@/components/materials/material-dialogs";
import { MaterialTable } from "@/components/materials/material-table";
import { PaginationBar, type PaginationDto } from "@/components/materials/pagination-bar";
import { ThumbnailSizeControl, type ThumbnailSize } from "@/components/materials/thumbnail-size-control";
import type { MaterialDto } from "@/components/materials/types";
import { VideoPreviewDialog } from "@/components/materials/video-preview-dialog";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import {
  SUB_CATEGORY_OPTIONS,
  getAllSelectableCategories,
  type UploadRootCategory
} from "@/lib/storage/storage.constants";
import { cn } from "@/lib/utils";

type ApiPayload = {
  materials: MaterialDto[];
  categories: string[];
  assetTypeLabels: Record<string, string>;
  facets?: {
    uploaders?: string[];
  };
  pagination?: PaginationDto;
};

type WorkbenchMode = "ingest" | "library" | "trash";
type MaterialViewMode = "thumbnail" | "list" | "detail";
type LibraryType = "ACCOUNT_MATERIAL" | "PRODUCT_MATERIAL" | "REFERENCE_VIDEO" | "PUBLIC_RESOURCE";

const DEFAULT_PAGINATION: PaginationDto = {
  total: 0,
  page: 1,
  pageSize: 48,
  pageCount: 1
};

const STATUS_OPTIONS = [
  ["ALL", "全部状态"],
  ["NEEDS_REVIEW", "待确认"],
  ["READY", "已入库"],
  ["IMPORTED", "已导入"],
  ["UNKNOWN", "待整理"],
  ["FAILED", "失败"]
];

export function MaterialAdmin({
  mode = "ingest"
}: {
  mode?: WorkbenchMode;
  initialLibraryType?: LibraryType;
}) {
  const [payload, setPayload] = useState<ApiPayload>({ materials: [], categories: [], assetTypeLabels: {} });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeMaterial, setActiveMaterial] = useState<MaterialDto | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<MaterialDto | null>(null);
  const [dialog, setDialog] = useState<
    | { type: "rename"; material: MaterialDto }
    | { type: "move"; material: MaterialDto }
    | { type: "tags"; material: MaterialDto }
    | { type: "trash"; material: MaterialDto }
    | { type: "restore"; material: MaterialDto }
    | { type: "resolve"; material: MaterialDto }
    | { type: "batchMove"; material: MaterialDto }
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [scopeOverride, setScopeOverride] = useState<"all" | null>(null);
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState("ALL");
  const [uploader, setUploader] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [issue, setIssue] = useState("ALL");
  const [dateRange, setDateRange] = useState("ALL");
  const [view, setView] = useState<MaterialViewMode>("thumbnail");
  const [thumbSize, setThumbSize] = useState<ThumbnailSize>("medium");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [categoryNodes, setCategoryNodes] = useState<CategoryNodeDto[]>([]);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<CategoryNodeDto[]>([]);
  const [categorySearch, setCategorySearch] = useState("");

  const trash = mode === "trash";
  const categories = payload.categories.length ? payload.categories : getAllSelectableCategories();
  const uploaders = useMemo(
    () => payload.facets?.uploaders?.length
      ? payload.facets.uploaders
      : Array.from(new Set(payload.materials.map((material) => material.shooterName || material.uploaderName).filter(Boolean))) as string[],
    [payload.facets?.uploaders, payload.materials]
  );
  const selectedCategoryPrefix = selectedCategoryPath.at(-1)?.relativePath || "";
  const selectedCategoryId = selectedCategoryPath.at(-1)?.id || "";
  const pagination = payload.pagination || DEFAULT_PAGINATION;

  async function refresh() {
    setLoading(true);
    setMessage("");
    const scope = trash ? "trash" : scopeOverride === "all" ? "all" : mode === "library" ? "library" : "queue";
    const params = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    if (status !== "ALL" && !trash) params.set("status", status);
    if (mode === "library" && selectedCategoryPrefix && scopeOverride !== "all") {
      if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
      params.set("categoryPrefix", selectedCategoryPrefix);
    }
    if (mode !== "library" && category !== "ALL") params.set("subCategory", category);
    if (uploader !== "ALL") params.set("shooter", uploader);
    if (confidence === "HIGH") params.set("confidenceMin", "0.85");
    if (confidence === "MID") {
      params.set("confidenceMin", "0.6");
      params.set("confidenceMax", "0.85");
    }
    if (confidence === "LOW") params.set("confidenceMax", "0.6");
    if (issue !== "ALL") params.set("issue", issue);
    const from = getFromDate(dateRange);
    if (from) params.set("from", from);
    const response = await fetch(`/api/materials?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as (ApiPayload & { error?: string }) | null;
    if (!response.ok || !data) {
      throw new Error(data?.error || "搜索接口出错：服务器没有返回有效 JSON。");
    }
    setPayload(data);
    setLoading(false);
  }

  async function loadCategories() {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { categories?: CategoryNodeDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "栏目配置加载失败。");
    setCategoryNodes(data.categories || []);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get("q") || "";
    if (urlQuery) {
      setQuery(urlQuery);
      setSubmittedQuery(urlQuery);
    }
    if (params.get("scope") === "all") setScopeOverride("all");
  }, []);

  useEffect(() => {
    loadCategories().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [page, pageSize, submittedQuery, status, category, uploader, confidence, issue, dateRange, selectedCategoryPrefix, selectedCategoryId, scopeOverride]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        setMessage(error.message);
        setLoading(false);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [trash, mode, submittedQuery, status, category, uploader, confidence, issue, dateRange, selectedCategoryPrefix, selectedCategoryId, scopeOverride, page, pageSize]);

  const filteredMaterials = payload.materials;

  async function post(path: string, body?: unknown) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {})
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage(data.error || "操作失败。");
      return null;
    }
    await refresh();
    setMessage("操作完成。");
    return data;
  }

  function submitSearch() {
    setPage(1);
    setSubmittedQuery(query.trim());
  }

  function clearSearch() {
    setQuery("");
    setSubmittedQuery("");
    setScopeOverride(null);
    setStatus("ALL");
    setCategory("ALL");
    setSelectedCategoryPath([]);
    setCategorySearch("");
    setUploader("ALL");
    setConfidence("ALL");
    setIssue("ALL");
    setDateRange("ALL");
    setPage(1);
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...new Set([...current, id])] : current.filter((item) => item !== id)));
  }

  async function rename(material: MaterialDto) {
    setDialog({ type: "rename", material });
  }

  async function move(material: MaterialDto) {
    setDialog({ type: "move", material });
  }

  async function editTags(material: MaterialDto) {
    setDialog({ type: "tags", material });
  }

  async function resolveConflictManually(material: MaterialDto) {
    setDialog({ type: "resolve", material });
  }

  async function trashMaterial(material: MaterialDto) {
    setDialog({ type: "trash", material });
  }

  async function restore(material: MaterialDto) {
    setDialog({ type: "restore", material });
  }

  async function batch(action: "confirm" | "move" | "trash" | "reanalyze" | "restore") {
    if (selectedIds.length === 0) {
      setMessage("请先选择素材。");
      return;
    }
    let body: Record<string, unknown> = { action, ids: selectedIds };
    if (action === "move") {
      const first = payload.materials.find((item) => item.id === selectedIds[0]);
      if (first) setDialog({ type: "batchMove", material: first });
      return;
    }
    if (action === "restore") {
      for (const id of selectedIds) {
        const material = payload.materials.find((item) => item.id === id);
        if (material) await post(`/api/materials/${material.id}/restore`);
      }
      setSelectedIds([]);
      return;
    }
    await post("/api/materials/batch", body);
    setSelectedIds([]);
  }

  const actions: MaterialActions = trash
    ? { restore }
    : {
        rename,
        move,
        editTags,
        trash: trashMaterial,
        reanalyze: (material) => post(`/api/materials/${material.id}/reanalyze`),
        regenerateDerivatives: (material) => post(`/api/materials/${material.id}/regenerate-derivatives`, {
          includeThumbnail: true,
          includeAiFrames: true,
          includePreview: true
        }),
        applyAiSuggestion: (material) => post(`/api/materials/${material.id}/apply-ai-suggestion`),
        confirm: (material) => post(`/api/materials/${material.id}/confirm`),
        useUserSelection: (material) => post(`/api/materials/${material.id}/resolve-conflict`, { action: "USE_USER_SELECTION" }),
        resolveConflictManually,
        addToPackage: () => setMessage("加入精选包是占位功能，后续阶段实现。")
      };

  const isGlobalSearch = scopeOverride === "all" && mode === "library";
  const libraryCategories = categories;

  return (
    <div className="min-w-0 space-y-4">
      {mode === "library" && !isGlobalSearch ? (
        <CategoryCascadeFilter
          categories={categoryNodes}
          selectedPath={selectedCategoryPath}
          search={categorySearch}
          onSearchChange={setCategorySearch}
          onSelectPath={(path) => {
            setSelectedCategoryPath(path);
            setPage(1);
          }}
          onClear={() => {
            setSelectedCategoryPath([]);
            setCategorySearch("");
            setPage(1);
          }}
        />
      ) : null}

      {mode === "ingest" ? (
        <div className="space-y-3">
          <Panel className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className={skin.typography.sectionTitle}>筛选条件</h2>
                <p className={cn("mt-1", skin.typography.meta)}>搜索和筛选只影响当前入库队列结果，不会执行任何素材操作。</p>
              </div>
              {submittedQuery ? <StatusPill tone="info">关键词：{submittedQuery}</StatusPill> : null}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1.4fr)_repeat(6,minmax(128px,1fr))]">
              <div className="relative sm:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSearch();
                  }}
                  placeholder="搜索素材 ID、文件名、标签、摘要"
                />
              </div>
              <Select value={status} onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
              <Select value={category} onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部分类</option>
                {libraryCategories.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={uploader} onChange={(event) => {
                setUploader(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部上传人</option>
                {uploaders.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={confidence} onChange={(event) => {
                setConfidence(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部置信度</option>
                <option value="HIGH">高置信度</option>
                <option value="MID">中置信度</option>
                <option value="LOW">低置信度</option>
              </Select>
              <Select value={issue} onChange={(event) => {
                setIssue(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部问题状态</option>
                {MATERIAL_ISSUE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
              <Select value={dateRange} onChange={(event) => {
                setDateRange(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部时间</option>
                <option value="TODAY">今天</option>
                <option value="7D">近 7 天</option>
                <option value="30D">近 30 天</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button className="min-h-[var(--skin-touch-target-min-height)] sm:min-h-0" onClick={submitSearch}>
                  <Search className="mr-1 h-3.5 w-3.5" /> 搜索
                </Button>
                <Button className="min-h-[var(--skin-touch-target-min-height)] sm:min-h-0" variant="secondary" onClick={clearSearch}>
                  <X className="mr-1 h-3.5 w-3.5" /> 清空
                </Button>
            </div>
          </Panel>

          <Panel className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className={skin.typography.sectionTitle}>视图切换</h2>
                <p className={cn("mt-1", skin.typography.meta)}>选择结果区展示密度，不影响筛选条件或分页。</p>
              </div>
              <StatusPill tone="neutral">{view === "thumbnail" ? `${thumbSizeLabel(thumbSize)}缩略图` : view === "list" ? "表格" : "详情"}</StatusPill>
            </div>
            <Surface tone="muted" padding="sm" className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="inline-flex w-full rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] p-1 sm:w-auto">
                <Button className="min-w-0 flex-1 px-2 sm:flex-none" variant={view === "thumbnail" ? "default" : "ghost"} size="sm" onClick={() => setView("thumbnail")} title="缩略图视图"><Grid2X2 className="mr-1 h-4 w-4" /> 缩略图</Button>
                <Button className="min-w-0 flex-1 px-2 sm:flex-none" variant={view === "list" ? "default" : "ghost"} size="sm" onClick={() => setView("list")} title="表格视图"><List className="mr-1 h-4 w-4" /> 表格</Button>
                <Button className="min-w-0 flex-1 px-2 sm:flex-none" variant={view === "detail" ? "default" : "ghost"} size="sm" onClick={() => setView("detail")} title="详细信息视图"><FileText className="mr-1 h-4 w-4" /> 详情</Button>
              </div>
              <div className={cn("min-w-0", view !== "thumbnail" && "hidden")}>
                <ThumbnailSizeControl value={thumbSize} onChange={setThumbSize} />
              </div>
            </Surface>
          </Panel>

          <Panel className="space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className={skin.typography.sectionTitle}>批量操作</h2>
                <div className={cn("mt-2 flex flex-wrap items-center gap-2", skin.typography.meta)}>
                  <StatusPill tone="neutral">当前结果 {pagination.total}</StatusPill>
                  <StatusPill tone="neutral">本页 {filteredMaterials.length}</StatusPill>
                  <StatusPill tone={selectedIds.length ? "info" : "neutral"}>已选 {selectedIds.length}</StatusPill>
                  {selectedCategoryPrefix ? <span className="break-all">目录：<span className="font-semibold text-foreground">{selectedCategoryPrefix}</span></span> : null}
                  {message ? <span className="text-primary">{message}</span> : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <Button disabled={selectedIds.length === 0} variant="secondary" size="sm" onClick={() => batch("confirm")}>批量确认</Button>
                <Button disabled={selectedIds.length === 0} variant="secondary" size="sm" onClick={() => batch("move")}>批量移动</Button>
                <Button disabled={selectedIds.length === 0} variant="secondary" size="sm" onClick={() => batch("reanalyze")}>批量重新识别</Button>
                <Button disabled={selectedIds.length === 0} variant="destructive" size="sm" className="order-last" onClick={() => batch("trash")}>批量删除</Button>
                <Button variant="secondary" size="sm" className="order-last xl:order-none" onClick={refresh}>
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" /> 刷新
                </Button>
              </div>
            </div>
          </Panel>
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-3 lg:p-4">
            {isGlobalSearch ? (
              <div className={cn("rounded-lg border bg-emerald-50 px-3 py-2 text-emerald-900", skin.typography.body)}>
                当前为全库搜索：覆盖入库队列和已入库素材，不包含回收站。
              </div>
            ) : null}
            <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-[minmax(220px,1.4fr)_repeat(5,minmax(112px,1fr))_auto_auto_auto]">
              <div className="relative col-span-2 lg:col-span-2 xl:col-span-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitSearch();
                  }}
                  placeholder="搜索素材 ID、文件名、标签、摘要"
                />
              </div>
              {!trash ? (
                <Select value={status} onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}>
                  {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              ) : null}
              {mode !== "library" ? (
                <Select value={category} onChange={(event) => {
                  setCategory(event.target.value);
                  setPage(1);
                }}>
                  <option value="ALL">全部分类</option>
                  {libraryCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                </Select>
              ) : null}
              <Select value={uploader} onChange={(event) => {
                setUploader(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部上传人</option>
                {uploaders.map((item) => <option key={item} value={item}>{item}</option>)}
              </Select>
              <Select value={confidence} onChange={(event) => {
                setConfidence(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部置信度</option>
                <option value="HIGH">高置信度</option>
                <option value="MID">中置信度</option>
                <option value="LOW">低置信度</option>
              </Select>
              <Select value={issue} onChange={(event) => {
                setIssue(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部问题状态</option>
                {MATERIAL_ISSUE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
              <Select value={dateRange} onChange={(event) => {
                setDateRange(event.target.value);
                setPage(1);
              }}>
                <option value="ALL">全部时间</option>
                <option value="TODAY">今天</option>
                <option value="7D">近 7 天</option>
                <option value="30D">近 30 天</option>
              </Select>
              <div className="flex gap-1 justify-self-end">
                <Button variant={view === "thumbnail" ? "default" : "secondary"} size="sm" onClick={() => setView("thumbnail")} title="缩略图视图"><Grid2X2 className="h-4 w-4" /></Button>
                <Button variant={view === "list" ? "default" : "secondary"} size="sm" onClick={() => setView("list")} title="列表视图"><List className="h-4 w-4" /></Button>
                <Button variant={view === "detail" ? "default" : "secondary"} size="sm" onClick={() => setView("detail")} title="详细信息视图"><FileText className="h-4 w-4" /></Button>
              </div>
              <Button size="sm" onClick={submitSearch}>
                <Search className="mr-1 h-3.5 w-3.5" /> 搜索
              </Button>
              <Button variant="secondary" size="sm" onClick={clearSearch}>
                <X className="mr-1 h-3.5 w-3.5" /> 清空
              </Button>
            </div>

            <div className={cn("flex flex-wrap items-center justify-between gap-2", skin.typography.body)}>
              <div className="text-muted-foreground">
                共 <span className="font-semibold text-foreground">{pagination.total}</span> 条，本页 {filteredMaterials.length} 条，已选 {selectedIds.length} 条
                {submittedQuery ? <span className="ml-3">关键词：<span className="font-semibold text-foreground">{submittedQuery}</span></span> : null}
                {selectedCategoryPrefix ? <span className="ml-3">目录：<span className="font-semibold text-foreground">{selectedCategoryPrefix}</span></span> : null}
                {message ? <span className="ml-3 text-primary">{message}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {view === "thumbnail" ? <ThumbnailSizeControl value={thumbSize} onChange={setThumbSize} /> : null}
                {!trash ? (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => batch("confirm")}>批量确认</Button>
                    <Button variant="secondary" size="sm" onClick={() => batch("move")}>批量移动</Button>
                    <Button variant="secondary" size="sm" onClick={() => batch("reanalyze")}>批量重新识别</Button>
                    <Button variant="destructive" size="sm" onClick={() => batch("trash")}>批量删除</Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => batch("restore")}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> 批量恢复
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={refresh}>
                  <RefreshCcw className="mr-1 h-3.5 w-3.5" /> 刷新
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <div className={cn("rounded-xl border bg-white p-6 text-muted-foreground", skin.typography.body)}>正在加载素材...</div> : null}

      {!loading && filteredMaterials.length === 0 ? (
        <EmptyState
          icon={Search}
          title="没有符合条件的素材"
          description="可以尝试搜索素材 ID、主体、场景、动作、标签、摘要或拍摄人。"
        />
      ) : null}

      {view === "thumbnail" ? (
        <div className={getThumbnailGridClass(thumbSize)}>
          {filteredMaterials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              size={thumbSize}
              selected={selectedIds.includes(material.id)}
              onSelect={(checked) => toggleSelected(material.id, checked)}
              onOpen={() => setActiveMaterial(material)}
            >
              {trash ? (
                <Button variant="secondary" size="sm" onClick={() => restore(material)}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" /> 恢复
                </Button>
              ) : (
                <ActionToolbar material={material} actions={actions} compact />
              )}
            </MaterialCard>
          ))}
        </div>
      ) : view === "list" ? (
        <div className="thin-scrollbar max-w-full overflow-auto">
          <MaterialTable materials={filteredMaterials} onOpen={setActiveMaterial} showDeletedAt={trash} />
        </div>
      ) : (
        <MaterialDetailList
          materials={filteredMaterials}
          selectedIds={selectedIds}
          onSelect={toggleSelected}
          onOpen={setActiveMaterial}
          actions={actions}
          trash={trash}
          onRestore={restore}
        />
      )}

      {!loading ? (
        <PaginationBar
          pagination={pagination}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
        />
      ) : null}

      <MaterialDetailDrawer
        material={activeMaterial}
        onClose={() => setActiveMaterial(null)}
        actions={trash ? {} : actions}
        onPreview={setPreviewMaterial}
      />
      <VideoPreviewDialog material={previewMaterial} onClose={() => setPreviewMaterial(null)} />
      {dialog ? renderDialog(dialog) : null}
      {busy ? <div className={cn("fixed bottom-4 right-4 z-50 rounded-lg bg-slate-950 px-3 py-2 text-white", skin.typography.body)}>处理中...</div> : null}
    </div>
  );

  function closeDialog() {
    setDialog(null);
  }

  function renderDialog(current: NonNullable<typeof dialog>) {
    if (current.type === "rename") {
      return (
        <RenameMaterialDialog
          material={current.material}
          onClose={closeDialog}
          onSubmit={async (fileName) => {
            await post(`/api/materials/${current.material.id}/rename`, { fileName });
            closeDialog();
          }}
        />
      );
    }
    if (current.type === "move") {
      return (
        <MoveMaterialDialog
          material={current.material}
          categories={categoryNodes}
          onClose={closeDialog}
          onSubmit={async (rootCategory, _subCategory, directory, category) => {
            await post(`/api/materials/${current.material.id}/move`, {
              categoryId: category?.id,
              assetType: rootCategory,
              category: directory
            });
            closeDialog();
          }}
        />
      );
    }
    if (current.type === "batchMove") {
      return (
        <MoveMaterialDialog
          material={current.material}
          title={`批量移动 ${selectedIds.length} 个素材`}
          submitLabel="批量移动到此目录"
          onClose={closeDialog}
          onSubmit={async (rootCategory, _subCategory, directory) => {
            await post("/api/materials/batch", {
              action: "move",
              ids: selectedIds,
              targetAssetType: rootCategory,
              targetCategory: directory
            });
            setSelectedIds([]);
            closeDialog();
          }}
        />
      );
    }
    if (current.type === "resolve") {
      return (
        <MoveMaterialDialog
          material={current.material}
          title="手动选择入库目录"
          submitLabel="使用此目录解决冲突"
          categories={categoryNodes}
          initialRootCategory={(current.material.userSelectedRootCategory as UploadRootCategory) || "ACCOUNT_MATERIAL"}
          initialSubCategory={findSubCategoryValue(current.material.userSelectedRootCategory, current.material.userSelectedSubCategory)}
          onClose={closeDialog}
          onSubmit={async (rootCategory, subCategory, _directory, category) => {
            await post(`/api/materials/${current.material.id}/resolve-conflict`, {
              action: "MANUAL_DIRECTORY",
              categoryId: category?.id,
              rootCategory,
              subCategory
            });
            closeDialog();
          }}
        />
      );
    }
    if (current.type === "tags") {
      return (
        <EditTagsDialog
          material={current.material}
          onClose={closeDialog}
          onSubmit={async (payload) => {
            await post(`/api/materials/${current.material.id}/tags`, {
              ...payload,
              humanConfirmed: true
            });
            closeDialog();
          }}
        />
      );
    }
    if (current.type === "trash") {
      return (
        <ConfirmMaterialDialog
          material={current.material}
          title="删除到回收站"
          description="不会物理删除文件，系统会把文件移动到 99_回收站，并记录操作日志。"
          confirmLabel="删除到回收站"
          tone="danger"
          onClose={closeDialog}
          onConfirm={async () => {
            await post(`/api/materials/${current.material.id}/trash`);
            closeDialog();
          }}
        />
      );
    }
    return (
      <MoveMaterialDialog
        material={current.material}
        title="恢复素材"
        submitLabel="恢复到此目录"
        onClose={closeDialog}
        onSubmit={async (_rootCategory, _subCategory, directory) => {
          await post(`/api/materials/${current.material.id}/restore`, { targetCategory: directory });
          closeDialog();
        }}
      />
    );
  }
}

function findSubCategoryValue(rootCategory?: string | null, label?: string | null) {
  if (!rootCategory || !(rootCategory in SUB_CATEGORY_OPTIONS)) return undefined;
  return SUB_CATEGORY_OPTIONS[rootCategory as UploadRootCategory].find((item) => item.label === label || item.value === label || item.directory === label)?.value;
}

function getFromDate(dateRange: string) {
  if (dateRange === "ALL") return "";
  const date = new Date();
  const days = dateRange === "TODAY" ? 1 : dateRange === "7D" ? 7 : 30;
  date.setDate(date.getDate() - days + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getThumbnailGridClass(size: ThumbnailSize) {
  if (size === "small") return "grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7";
  if (size === "large") return "grid min-w-0 gap-4 lg:grid-cols-2 2xl:grid-cols-3";
  return "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
}

function thumbSizeLabel(size: ThumbnailSize) {
  if (size === "small") return "小";
  if (size === "large") return "大";
  return "中";
}

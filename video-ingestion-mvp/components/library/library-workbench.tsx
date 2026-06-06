"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  FilePenLine,
  Folder,
  FolderInput,
  Grid2X2,
  ImagePlus,
  List,
  MoreHorizontal,
  PackagePlus,
  Play,
  RefreshCcw,
  Search,
  Settings2,
  Tags,
  Trash2,
  X
} from "lucide-react";

import { type MaterialActions } from "@/components/materials/action-toolbar";
import { ConfidenceBadge } from "@/components/materials/confidence-badge";
import { MATERIAL_ISSUE_OPTIONS, MaterialIssueBadges } from "@/components/materials/material-issue-badges";
import { MaterialDetailDrawer } from "@/components/materials/material-detail-drawer";
import {
  ConfirmMaterialDialog,
  EditTagsDialog,
  MoveMaterialDialog,
  RenameMaterialDialog
} from "@/components/materials/material-dialogs";
import { PaginationBar, type PaginationDto } from "@/components/materials/pagination-bar";
import { StatusBadge } from "@/components/materials/status-badge";
import type { CategoryNodeDto } from "@/components/materials/category-cascade-filter";
import type { MaterialDto } from "@/components/materials/types";
import { VideoPreviewDialog } from "@/components/materials/video-preview-dialog";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fileTypeFromMime } from "@/components/ui/file-type-icon";
import { Input } from "@/components/ui/input";
import { MediaPlaceholder } from "@/components/ui/media-placeholder";
import { MetricCard } from "@/components/ui/metric-card";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { cn, toLocalDateTime } from "@/lib/utils";

type ApiPayload = {
  materials: MaterialDto[];
  categories: string[];
  facets?: { uploaders?: string[] };
  pagination?: PaginationDto;
};

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
};

type DirectorySelection =
  | { type: "all"; label: string }
  | { type: "recent"; label: string }
  | { type: "unorganized"; label: string }
  | { type: "category"; label: string; category: CategoryNodeDto };

type ViewMode = "small" | "medium" | "large" | "table";
type DialogState =
  | { type: "rename"; material: MaterialDto }
  | { type: "move"; material: MaterialDto }
  | { type: "tags"; material: MaterialDto }
  | { type: "trash"; material: MaterialDto }
  | { type: "batchMove"; material: MaterialDto }
  | null;

type PackageOptionDto = {
  packageId: string;
  name: string;
  purpose?: string | null;
  status: "ACTIVE" | "ARCHIVED" | "DELETED";
  itemCount: number;
};

type PackageDialogState =
  | { type: "existing"; ids: string[] }
  | { type: "create"; ids: string[] }
  | null;

const DEFAULT_PAGINATION: PaginationDto = { total: 0, page: 1, pageSize: 48, pageCount: 1 };
const { terminology: terms } = getRuntimeAppConfig();

const STATUS_OPTIONS = [
  ["ALL", "全部状态"],
  ["READY", "已入库"],
  ["IMPORTED", "已导入"],
  ["NEEDS_REVIEW", "待确认"],
  ["PROCESSING", "处理中"],
  ["FAILED", "失败"],
  ["UNKNOWN", "待整理"]
];

const DATE_OPTIONS = [
  ["ALL", "全部时间"],
  ["TODAY", "今天"],
  ["7D", "近 7 天"],
  ["30D", "近 30 天"]
];

export function LibraryWorkbench() {
  const [payload, setPayload] = useState<ApiPayload>({ materials: [], categories: [] });
  const [categories, setCategories] = useState<CategoryNodeDto[]>([]);
  const [selection, setSelection] = useState<DirectorySelection>({ type: "all", label: terms.library.all });
  const [activeMaterial, setActiveMaterial] = useState<MaterialDto | null>(null);
  const [previewMaterial, setPreviewMaterial] = useState<MaterialDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [packageDialog, setPackageDialog] = useState<PackageDialogState>(null);
  const [packageOptions, setPackageOptions] = useState<PackageOptionDto[]>([]);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [uploader, setUploader] = useState("ALL");
  const [dateRange, setDateRange] = useState("ALL");
  const [confidence, setConfidence] = useState("ALL");
  const [issue, setIssue] = useState("ALL");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("medium");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDirectoryOpen, setMobileDirectoryOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const pagination = payload.pagination || DEFAULT_PAGINATION;
  const materials = payload.materials;
  const canManageMaterials = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "ADMIN";
  const canSelectMaterials = Boolean(currentUser);
  const uploaders = payload.facets?.uploaders || [];
  const categoryPrefix = selection.type === "category" ? selection.category.relativePath || "" : "";
  const selectedCategoryId = selection.type === "category" ? selection.category.id : "";

  useEffect(() => {
    loadCategories().catch((error) => setMessage(error.message));
    loadCurrentUser().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh().catch((error) => {
        setMessage(error.message);
        setLoading(false);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [submittedQuery, status, uploader, dateRange, confidence, issue, categoryPrefix, selection.type, page, pageSize]);

  useEffect(() => {
    setSelectedIds([]);
  }, [submittedQuery, status, uploader, dateRange, confidence, issue, categoryPrefix, selection.type, page, pageSize]);

  useEffect(() => {
    if (!activeMaterial) return;
    const latest = materials.find((item) => item.id === activeMaterial.id);
    if (latest) setActiveMaterial(latest);
  }, [materials, activeMaterial?.id]);

  async function loadCategories() {
    const response = await fetch("/api/categories", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { categories?: CategoryNodeDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "栏目配置加载失败。");
    setCategories(data.categories || []);
  }

  async function loadCurrentUser() {
    const response = await fetch("/api/auth/me", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { user?: CurrentUser | null } | null;
    setCurrentUser(data?.user || null);
  }

  async function loadPackageOptions() {
    const response = await fetch("/api/packages?status=ACTIVE&limit=200", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { packages?: PackageOptionDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "精选包列表加载失败。");
    setPackageOptions(data.packages || []);
  }

  async function refresh() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ scope: "library", page: String(page), pageSize: String(pageSize) });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    if (selection.type === "category") {
      if (selectedCategoryId) params.set("categoryId", selectedCategoryId);
      if (categoryPrefix) params.set("categoryPrefix", categoryPrefix);
    }
    if (selection.type === "unorganized") params.set("status", "UNKNOWN");
    if (selection.type === "recent") params.set("from", getFromDate("7D"));
    if (status !== "ALL" && selection.type !== "unorganized") params.set("status", status);
    if (uploader !== "ALL") params.set("shooter", uploader);
    if (dateRange !== "ALL" && selection.type !== "recent") params.set("from", getFromDate(dateRange));
    if (confidence === "HIGH") params.set("confidenceMin", "0.85");
    if (confidence === "MID") {
      params.set("confidenceMin", "0.6");
      params.set("confidenceMax", "0.85");
    }
    if (confidence === "LOW") params.set("confidenceMax", "0.6");
    if (issue !== "ALL") params.set("issue", issue);

    const response = await fetch(`/api/materials?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as (ApiPayload & { error?: string }) | null;
    if (!response.ok || !data) throw new Error(data?.error || "素材查询失败。");
    setPayload(data);
    setLoading(false);
  }

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

  function resetFilters() {
    setQuery("");
    setSubmittedQuery("");
    setStatus("ALL");
    setUploader("ALL");
    setDateRange("ALL");
    setConfidence("ALL");
    setIssue("ALL");
    setSelection({ type: "all", label: terms.library.all });
    setPage(1);
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id));
  }

  async function batch(action: "move" | "trash" | "reanalyze") {
    if (selectedIds.length === 0) {
      setMessage("请先选择素材。");
      return;
    }
    if (!canManageMaterials) {
      setMessage("当前账号只有素材库只读权限。");
      return;
    }
    if (action === "move") {
      const first = materials.find((item) => item.id === selectedIds[0]);
      if (first) setDialog({ type: "batchMove", material: first });
      return;
    }
    await post("/api/materials/batch", { action, ids: selectedIds });
    setSelectedIds([]);
  }

  async function exportSelection(format: "json" | "csv") {
    if (selectedIds.length === 0) {
      setMessage("请先选择素材。");
      return;
    }
    setBusy(`export-${format}`);
    setMessage("");
    const response = await fetch("/api/materials/batch/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, format })
    });
    setBusy("");
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      setMessage(data.error || "精选包清单导出失败。");
      return;
    }
    const blob = await response.blob();
    const fileName = downloadFileName(response.headers.get("content-disposition"), `selection.${format}`);
    downloadBlob(blob, fileName);
    setMessage(`已导出精选包清单：${selectedIds.length} 个素材。`);
  }

  function downloadSelectionPackage(variant: "original" | "preview") {
    if (selectedIds.length === 0) {
      setMessage("请先选择素材。");
      return;
    }
    const params = new URLSearchParams({
      ids: selectedIds.join(","),
      variant
    });
    window.open(`/api/materials/batch/download?${params.toString()}`, "_blank", "noopener,noreferrer");
    setMessage(variant === "preview" ? `正在生成预览文件包：${selectedIds.length} 个素材。` : `正在生成原文件包：${selectedIds.length} 个素材。`);
  }

  async function openPackageDialog(type: "existing" | "create", ids = selectedIds) {
    if (!canManageMaterials) {
      setMessage("当前账号没有管理精选包权限。");
      return;
    }
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      setMessage("请先选择素材。");
      return;
    }
    setMessage("");
    setPackageDialog({ type, ids: uniqueIds });
    if (type === "existing") {
      try {
        await loadPackageOptions();
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
  }

  async function addMaterialsToPackage(packageId: string, ids: string[]) {
    setBusy("package-add");
    const response = await fetch(`/api/packages/${encodeURIComponent(packageId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });
    const data = await response.json().catch(() => null) as { addedCount?: number; skippedCount?: number; error?: string } | null;
    setBusy("");
    if (!response.ok || !data) {
      setMessage(data?.error || "加入精选包失败。");
      return false;
    }
    setMessage(`已加入精选包：新增 ${data.addedCount || 0} 个，已存在 ${data.skippedCount || 0} 个。`);
    setPackageDialog(null);
    return true;
  }

  async function createPackageAndAdd(payload: { name: string; purpose?: string; notes?: string }, ids: string[]) {
    setBusy("package-create");
    const createResponse = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const created = await createResponse.json().catch(() => null) as { package?: PackageOptionDto; error?: string } | null;
    setBusy("");
    if (!createResponse.ok || !created?.package) {
      setMessage(created?.error || "创建精选包失败。");
      return false;
    }
    return addMaterialsToPackage(created.package.packageId, ids);
  }

  const drawerActions: MaterialActions = {
    ...(canManageMaterials ? {
      rename: (material: MaterialDto) => handleAction("rename", material),
      move: (material: MaterialDto) => handleAction("move", material),
      editTags: (material: MaterialDto) => handleAction("tags", material),
      trash: (material: MaterialDto) => handleAction("trash", material),
      reanalyze: (material: MaterialDto) => handleAction("reanalyze", material),
      regenerateDerivatives: (material: MaterialDto) => handleAction("regenerateDerivatives", material),
      applyAiSuggestion: (material: MaterialDto) => handleAction("applyAiSuggestion", material),
      confirm: (material: MaterialDto) => handleAction("confirm", material)
    } : {}),
    addToPackage: (material) => handleAction("package", material)
  };

  return (
    <div
      style={skin.vars}
      className={cn(
        skin.responsive.libraryShell,
        sidebarCollapsed ? skin.responsive.libraryShellCollapsed : skin.responsive.libraryShellExpanded
      )}
    >
      <div className="hidden lg:block">
        <LibrarySidebar
          categories={categories}
          selected={selection}
          total={pagination.total}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onSelect={(next) => {
            setSelection(next);
            setPage(1);
          }}
        />
      </div>

      <main className={skin.responsive.libraryContent}>
        <div className="flex min-w-0 items-center gap-2 lg:hidden">
          <Button className="min-h-[var(--skin-touch-target-min-height)]" variant="secondary" size="sm" onClick={() => setMobileDirectoryOpen(true)}>
            <Folder className="mr-1 h-4 w-4" /> 目录筛选
          </Button>
          <StatusPill tone="neutral" className="min-w-0 max-w-[60vw] truncate">{selection.label}</StatusPill>
        </div>
        <LibraryToolbar
          query={query}
          status={status}
          uploader={uploader}
          dateRange={dateRange}
          confidence={confidence}
          issue={issue}
          uploaders={uploaders}
          view={view}
          advancedOpen={advancedOpen}
          total={pagination.total}
          loading={loading}
          message={message}
          onQueryChange={setQuery}
          onSubmitSearch={submitSearch}
          onStatusChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          onUploaderChange={(value) => {
            setUploader(value);
            setPage(1);
          }}
          onDateRangeChange={(value) => {
            setDateRange(value);
            setPage(1);
          }}
          onConfidenceChange={(value) => {
            setConfidence(value);
            setPage(1);
          }}
          onIssueChange={(value) => {
            setIssue(value);
            setPage(1);
          }}
          onAdvancedToggle={() => setAdvancedOpen((current) => !current)}
          onViewChange={setView}
          onRefresh={refresh}
          onReset={resetFilters}
        />

        {loading ? (
          <Surface className={cn("p-8 text-muted-foreground", skin.typography.body)}>
            正在加载{terms.material.plural}...
          </Surface>
        ) : null}

        {!loading && materials.length === 0 ? (
          <LibraryEmptyState
            selection={selection}
            hasQuery={Boolean(submittedQuery.trim())}
            hasFilters={hasActiveLibraryFilters(status, uploader, dateRange, confidence, issue)}
          />
        ) : null}

        {!loading && materials.length > 0 ? (
          view === "table" ? (
            <LibraryTable
              materials={materials}
              selectedIds={selectedIds}
              onSelect={toggleSelected}
              onOpen={setActiveMaterial}
              onPreview={setPreviewMaterial}
              onAction={handleAction}
              canSelect={canSelectMaterials}
              canManage={canManageMaterials}
            />
          ) : (
            <MaterialGrid
              materials={materials}
              view={view}
              selectedIds={selectedIds}
              activeId={activeMaterial?.id}
              onSelect={toggleSelected}
              onOpen={setActiveMaterial}
              onPreview={setPreviewMaterial}
              onAction={handleAction}
              canSelect={canSelectMaterials}
              canManage={canManageMaterials}
            />
          )
        ) : null}

        {!loading && materials.length > 0 ? (
          <Surface tone="plain" padding="none">
            <PaginationBar
              pagination={pagination}
              onPageChange={setPage}
              onPageSizeChange={(nextPageSize) => {
                setPageSize(nextPageSize);
                setPage(1);
              }}
            />
          </Surface>
        ) : null}
      </main>

      <MaterialDetailDrawer
        material={activeMaterial}
        onClose={() => setActiveMaterial(null)}
        actions={drawerActions}
        onPreview={setPreviewMaterial}
      />

      {selectedIds.length > 0 ? (
        <BatchActionBar
          count={selectedIds.length}
          canManage={canManageMaterials}
          onMove={() => batch("move")}
          onEditTags={() => setMessage("批量编辑标签后续接入批量标签 API。")}
          onExportJson={() => exportSelection("json")}
          onExportCsv={() => exportSelection("csv")}
          onDownloadOriginals={() => downloadSelectionPackage("original")}
          onDownloadPreviews={() => downloadSelectionPackage("preview")}
          onAddToPackage={() => openPackageDialog("existing")}
          onCreatePackage={() => openPackageDialog("create")}
          onReanalyze={() => batch("reanalyze")}
          onTrash={() => batch("trash")}
          onCancel={() => setSelectedIds([])}
        />
      ) : null}

      <VideoPreviewDialog material={previewMaterial} onClose={() => setPreviewMaterial(null)} />
      {mobileDirectoryOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-[color:var(--skin-overlay)]" aria-label="关闭目录筛选" onClick={() => setMobileDirectoryOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[var(--skin-mobile-drawer-width)] max-w-[var(--skin-mobile-drawer-max-width)] bg-[color:var(--skin-page-bg)] p-3 shadow-[var(--skin-shadow-elevated)]">
            <LibrarySidebar
              categories={categories}
              selected={selection}
              total={pagination.total}
              collapsed={false}
              onToggleCollapsed={() => setMobileDirectoryOpen(false)}
              onSelect={(next) => {
                setSelection(next);
                setPage(1);
                setMobileDirectoryOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
      {packageDialog ? (
        <PackageSelectionDialog
          state={packageDialog}
          packages={packageOptions}
          busy={busy}
          onClose={() => setPackageDialog(null)}
          onLoadPackages={() => loadPackageOptions().catch((error) => setMessage(error.message))}
          onAdd={(packageId) => addMaterialsToPackage(packageId, packageDialog.ids)}
          onCreate={(payload) => createPackageAndAdd(payload, packageDialog.ids)}
        />
      ) : null}
      {dialog ? renderDialog(dialog) : null}
      {busy ? <div className={cn("fixed bottom-4 right-4 z-50 rounded-[var(--skin-radius-control)] bg-slate-950 px-3 py-2 text-white shadow-[var(--skin-shadow-elevated)]", skin.typography.body)}>处理中...</div> : null}
    </div>
  );

  function handleAction(action: string, material: MaterialDto) {
    if (!canManageMaterials && action !== "preview" && action !== "package") {
      setMessage("当前账号只有素材库只读权限。");
      return;
    }
    if (action === "rename") setDialog({ type: "rename", material });
    if (action === "move") setDialog({ type: "move", material });
    if (action === "tags") setDialog({ type: "tags", material });
    if (action === "trash") setDialog({ type: "trash", material });
    if (action === "preview") setPreviewMaterial(material);
    if (action === "reanalyze") void post(`/api/materials/${material.id}/reanalyze`);
    if (action === "regenerateDerivatives") void post(`/api/materials/${material.id}/regenerate-derivatives`, {
      includeThumbnail: true,
      includeAiFrames: true,
      includePreview: true
    });
    if (action === "applyAiSuggestion") void post(`/api/materials/${material.id}/apply-ai-suggestion`);
    if (action === "confirm") void post(`/api/materials/${material.id}/confirm`);
    if (action === "package") {
      void openPackageDialog("existing", [material.id]);
    }
  }

  function renderDialog(current: NonNullable<typeof dialog>) {
    if (current.type === "rename") {
      return (
        <RenameMaterialDialog
          material={current.material}
          onClose={() => setDialog(null)}
          onSubmit={async (fileName) => {
            await post(`/api/materials/${current.material.id}/rename`, { fileName });
            setDialog(null);
          }}
        />
      );
    }
    if (current.type === "move") {
      return (
        <MoveMaterialDialog
          material={current.material}
          categories={categories}
          onClose={() => setDialog(null)}
          onSubmit={async (rootCategory, _subCategory, directory, category) => {
            await post(`/api/materials/${current.material.id}/move`, {
              categoryId: category?.id,
              assetType: rootCategory,
              category: directory
            });
            setDialog(null);
          }}
        />
      );
    }
    if (current.type === "batchMove") {
      return (
        <MoveMaterialDialog
          material={current.material}
        title={`批量移动 ${selectedIds.length} 个${terms.material.singular}`}
          submitLabel="批量移动到此目录"
          onClose={() => setDialog(null)}
          onSubmit={async (rootCategory, _subCategory, directory) => {
            await post("/api/materials/batch", {
              action: "move",
              ids: selectedIds,
              targetAssetType: rootCategory,
              targetCategory: directory
            });
            setSelectedIds([]);
            setDialog(null);
          }}
        />
      );
    }
    if (current.type === "tags") {
      return (
        <EditTagsDialog
          material={current.material}
          onClose={() => setDialog(null)}
          onSubmit={async (payload) => {
            await post(`/api/materials/${current.material.id}/tags`, { ...payload, humanConfirmed: true });
            setDialog(null);
          }}
        />
      );
    }
    return (
      <ConfirmMaterialDialog
        material={current.material}
        title="删除到回收站"
        description="不会物理删除文件，系统会把文件移动到 99_回收站，并记录操作日志。"
        confirmLabel="删除到回收站"
        tone="danger"
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          await post(`/api/materials/${current.material.id}/trash`);
          setDialog(null);
        }}
      />
    );
  }
}

function LibrarySidebar({
  categories,
  selected,
  total,
  collapsed,
  onToggleCollapsed,
  onSelect
}: {
  categories: CategoryNodeDto[];
  selected: DirectorySelection;
  total: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelect: (selection: DirectorySelection) => void;
}) {
  const roots = useMemo(() => categories.filter((item) => !item.parentId), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryNodeDto[]>();
    for (const category of categories) {
      if (!category.parentId) continue;
      map.set(category.parentId, [...(map.get(category.parentId) || []), category]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hans-CN"));
    return map;
  }, [categories]);

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden", skin.panel)}>
      <div className={cn("shrink-0 border-b border-[color:var(--skin-border-subtle)] px-3 py-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2 font-semibold", collapsed && "justify-center")}>
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-[var(--skin-radius-control)] bg-[color:var(--skin-surface-selected)] text-primary", collapsed && "hidden")}>
            <Folder className="h-4 w-4" />
          </div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className={cn("truncate", skin.typography.sectionTitle)}>{terms.library.noun}</p>
              <p className={cn("font-normal", skin.typography.meta)}>本地素材目录</p>
            </div>
          ) : null}
          <button
            type="button"
            className={cn(
              "rounded-[var(--skin-radius-sm)] p-1 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]",
              collapsed ? "shrink-0" : "ml-auto"
            )}
            onClick={onToggleCollapsed}
            title={collapsed ? "展开目录" : "收起目录"}
            aria-label={collapsed ? "展开目录" : "收起目录"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className={cn("thin-scrollbar min-h-0 flex-1 overflow-auto px-3 py-3", collapsed && "px-2")}>
        <div className="space-y-1">
          <SidebarItem collapsed={collapsed} active={selected.type === "all"} icon={<Grid2X2 className="h-4 w-4" />} label={terms.library.all} count={total} onClick={() => onSelect({ type: "all", label: terms.library.all })} />
          <SidebarItem collapsed={collapsed} active={selected.type === "recent"} icon={<Clock3 className="h-4 w-4" />} label={terms.upload.recent} onClick={() => onSelect({ type: "recent", label: terms.upload.recent })} />
          <SidebarItem collapsed={collapsed} active={selected.type === "unorganized"} icon={<FileText className="h-4 w-4" />} label="待整理" onClick={() => onSelect({ type: "unorganized", label: "待整理" })} />
        </div>

        {!collapsed ? <div className="mt-5 border-t border-[color:var(--skin-border-subtle)] pt-4">
          <div className={cn("mb-2 flex items-center justify-between px-2 font-semibold", skin.typography.meta)}>
            <span>{terms.category.directory}</span>
            <span>{roots.length}</span>
          </div>
          <div className="space-y-1">
            {roots.map((root) => (
              <CategoryTreeNode
                key={root.id}
                node={root}
                childrenByParent={childrenByParent}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div> : null}
      </div>
    </aside>
  );
}

function CategoryTreeNode({
  node,
  childrenByParent,
  selected,
  onSelect,
  depth = 0
}: {
  node: CategoryNodeDto;
  childrenByParent: Map<string, CategoryNodeDto[]>;
  selected: DirectorySelection;
  onSelect: (selection: DirectorySelection) => void;
  depth?: number;
}) {
  const children = childrenByParent.get(node.id) || [];
  const [open, setOpen] = useState(depth < 1);
  const active = selected.type === "category" && selected.category.id === node.id;

  return (
    <div>
      <div className="flex items-center gap-1">
        {children.length ? (
          <button type="button" className="rounded-[var(--skin-radius-sm)] p-0.5 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]" onClick={() => setOpen((current) => !current)}>
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <SidebarItem
          active={active}
          compact
          label={node.name}
          count={node.materialCount}
          disabled={node.status !== "ACTIVE"}
          onClick={() => onSelect({ type: "category", label: node.name, category: node })}
        />
      </div>
      {open && children.length ? (
        <div className="ml-4 border-l border-[color:var(--skin-border-subtle)] pl-2">
          {children.map((child) => (
            <CategoryTreeNode
              key={child.id}
              node={child}
              childrenByParent={childrenByParent}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SidebarItem({
  active,
  icon,
  label,
  count,
  compact,
  collapsed,
  disabled,
  onClick
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  count?: number;
  compact?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-[var(--skin-radius-control)] px-2 py-2 text-left transition",
        skin.typography.bodyDense,
        compact && "py-1.5",
        collapsed && "justify-center px-0",
        active ? "border border-emerald-200 bg-[color:var(--skin-surface-selected)] font-semibold text-primary shadow-[var(--skin-shadow-card)]" : "text-foreground hover:bg-[color:var(--skin-surface-hover)]",
        disabled && "text-muted-foreground opacity-55"
      )}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      {icon ? <span className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground")}>{icon}</span> : null}
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{label}</span> : null}
      {!collapsed && typeof count === "number" ? (
        <span className={cn("rounded-[var(--skin-radius-full)] bg-[color:var(--skin-muted-bg)] px-2 py-0.5 tabular-nums", skin.typography.meta)}>{count}</span>
      ) : null}
    </button>
  );
}

function LibraryToolbar(props: {
  query: string;
  status: string;
  uploader: string;
  dateRange: string;
  confidence: string;
  issue: string;
  uploaders: string[];
  view: ViewMode;
  advancedOpen: boolean;
  total: number;
  loading: boolean;
  message: string;
  onQueryChange: (value: string) => void;
  onSubmitSearch: () => void;
  onStatusChange: (value: string) => void;
  onUploaderChange: (value: string) => void;
  onDateRangeChange: (value: string) => void;
  onConfidenceChange: (value: string) => void;
  onIssueChange: (value: string) => void;
  onAdvancedToggle: () => void;
  onViewChange: (value: ViewMode) => void;
  onRefresh: () => void;
  onReset: () => void;
}) {
  const activeFilterCount = [
    props.status !== "ALL",
    props.uploader !== "ALL",
    props.dateRange !== "ALL",
    props.confidence !== "ALL",
    props.issue !== "ALL"
  ].filter(Boolean).length;

  return (
    <Panel className={skin.responsive.libraryToolbar}>
      <div className="grid min-w-0 gap-2 lg:grid-cols-[minmax(280px,1fr)_auto] lg:items-start">
        <div className="relative min-w-0">
          <Input
            className="h-[var(--skin-toolbar-control-height)] bg-[color:var(--skin-surface-input)] pr-10"
            value={props.query}
            placeholder={terms.library.searchPlaceholder}
            onChange={(event) => props.onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") props.onSubmitSearch();
            }}
          />
          <button type="button" className="absolute right-2 top-2 rounded-[var(--skin-radius-sm)] p-1 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]" onClick={props.onSubmitSearch}>
            <Search className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
          <Select className="h-[var(--skin-toolbar-control-height)] min-w-[8rem] flex-1 sm:flex-none lg:w-32" value={props.status} onChange={(event) => props.onStatusChange(event.target.value)}>
            {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Select className="h-[var(--skin-toolbar-control-height)] min-w-[8rem] flex-1 sm:flex-none lg:w-32" value={props.uploader} onChange={(event) => props.onUploaderChange(event.target.value)}>
            <option value="ALL">{terms.shooter.singular}</option>
            {props.uploaders.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select className="h-[var(--skin-toolbar-control-height)] min-w-[8rem] flex-1 sm:flex-none lg:w-32" value={props.dateRange} onChange={(event) => props.onDateRangeChange(event.target.value)}>
            {DATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <Button className="min-h-[var(--skin-toolbar-control-height)] flex-1 sm:flex-none" variant="secondary" onClick={props.onAdvancedToggle}>
            <Settings2 className="mr-1 h-4 w-4" /> 高级筛选{activeFilterCount ? ` ${activeFilterCount}` : ""}
          </Button>
          <ViewModeSwitcher value={props.view} onChange={props.onViewChange} />
          <Button className="h-[var(--skin-toolbar-control-height)] w-[var(--skin-toolbar-control-height)] p-0" variant="ghost" size="sm" onClick={props.onRefresh} aria-label="刷新素材列表"><RefreshCcw className="h-4 w-4" /></Button>
        </div>
      </div>
      {props.advancedOpen ? (
        <div className="grid gap-2 border-t border-[color:var(--skin-border-subtle)] pt-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,12rem)_auto]">
          <Select className="h-[var(--skin-control-height-md)] w-full" value={props.confidence} onChange={(event) => props.onConfidenceChange(event.target.value)}>
            <option value="ALL">全部置信度</option>
            <option value="HIGH">高置信度</option>
            <option value="MID">中置信度</option>
            <option value="LOW">低置信度</option>
          </Select>
          <Select className="h-[var(--skin-control-height-md)] w-full" value={props.issue} onChange={(event) => props.onIssueChange(event.target.value)}>
            <option value="ALL">全部问题状态</option>
            {MATERIAL_ISSUE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Button className="min-h-[var(--skin-control-height-md)]" variant="secondary" size="sm" onClick={props.onReset}>
            <X className="mr-1 h-3.5 w-3.5" /> 清空筛选
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 border-t border-[color:var(--skin-border-subtle)] pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <MetricCard
            label="当前结果"
            value={props.loading ? "..." : props.total}
            icon={Folder}
            tone="neutral"
            className="min-w-32 p-2 shadow-none"
          />
          {activeFilterCount ? <StatusPill tone="info" withDot>已启用 {activeFilterCount} 个筛选</StatusPill> : <StatusPill tone="neutral">全部素材</StatusPill>}
          <StatusPill tone="neutral" className="max-w-[70vw] truncate sm:max-w-xs">{props.view === "table" ? "表格视图" : "卡片视图"}</StatusPill>
        </div>
        {props.message ? <span className={cn("min-w-0 truncate font-medium text-primary sm:text-right", skin.typography.meta)}>{props.message}</span> : null}
      </div>
    </Panel>
  );
}

function ViewModeSwitcher({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  const items: Array<{ value: ViewMode; label: string; icon: React.ReactNode }> = [
    { value: "small", label: "小缩略图", icon: <Grid2X2 className="h-4 w-4" /> },
    { value: "medium", label: "中缩略图", icon: <Grid2X2 className="h-4 w-4" /> },
    { value: "large", label: "大缩略图", icon: <Grid2X2 className="h-4 w-4" /> },
    { value: "table", label: "表格视图", icon: <List className="h-4 w-4" /> }
  ];
  return (
    <div className="flex max-w-full overflow-x-auto rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border)] bg-[color:var(--skin-muted-bg)] p-1">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          title={item.label}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1 rounded-[var(--skin-radius-sm)] px-2 font-medium transition",
            skin.typography.badge,
            value === item.value ? "bg-primary text-primary-foreground shadow-[var(--skin-shadow-card)]" : "text-muted-foreground hover:bg-[color:var(--skin-panel-bg)]"
          )}
          onClick={() => onChange(item.value)}
        >
          {item.icon}
          <span className="hidden 2xl:inline">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function MaterialGrid(props: {
  materials: MaterialDto[];
  view: Exclude<ViewMode, "table">;
  selectedIds: string[];
  activeId?: string;
  canSelect: boolean;
  canManage: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (material: MaterialDto) => void;
  onPreview: (material: MaterialDto) => void;
  onAction: (action: string, material: MaterialDto) => void;
}) {
  const minWidth = props.view === "small" ? "min(var(--skin-library-grid-sm-min), 100%)" : props.view === "large" ? "min(var(--skin-library-grid-lg-min), 100%)" : "min(var(--skin-library-grid-md-min), 100%)";
  return (
    <div className={skin.responsive.libraryGrid} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}, 1fr))` }}>
      {props.materials.map((material) => (
        <LibraryMaterialCard key={material.id} {...props} material={material} />
      ))}
    </div>
  );
}

function LibraryMaterialCard({
  material,
  view,
  selectedIds,
  activeId,
  canSelect,
  canManage,
  onSelect,
  onOpen,
  onPreview,
  onAction
}: {
  material: MaterialDto;
  view: Exclude<ViewMode, "table">;
  selectedIds: string[];
  activeId?: string;
  canSelect: boolean;
  canManage: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (material: MaterialDto) => void;
  onPreview: (material: MaterialDto) => void;
  onAction: (action: string, material: MaterialDto) => void;
}) {
  const selected = selectedIds.includes(material.id);
  const active = activeId === material.id;
  const compact = view === "small";
  const thumbHeight = view === "small" ? "h-[var(--skin-thumbnail-height-sm)]" : view === "large" ? "h-[var(--skin-thumbnail-height-lg)]" : "h-[var(--skin-thumbnail-height-md)]";

  return (
    <article
      className={cn(
        "group min-w-0 overflow-hidden rounded-[var(--skin-radius-card)] border bg-[color:var(--skin-panel-bg)] shadow-[var(--skin-shadow-card)] transition hover:border-primary/40 hover:shadow-[var(--skin-shadow-panel)]",
        selected || active ? "border-primary ring-1 ring-primary" : "border-[color:var(--skin-border)]"
      )}
    >
      <div className="relative bg-[color:var(--skin-media-thumbnail-bg)]">
        <button type="button" className={cn("block w-full overflow-hidden", thumbHeight)} onClick={() => onPreview(material)}>
          {material.thumbnailPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="h-full w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
          ) : (
            <MediaPlaceholder type={fileTypeFromMime(material.mimeType)} size={view === "large" ? "lg" : compact ? "sm" : "md"} />
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="rounded-full bg-black/55 p-2 text-white"><Play className="h-4 w-4 fill-current" /></span>
          </span>
        </button>
        {canSelect ? (
          <input
            className="absolute left-2 top-2 h-5 w-5 rounded border-white shadow"
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(material.id, event.target.checked)}
          />
        ) : null}
        <span className={cn("absolute right-2 top-2 rounded-[var(--skin-radius-sm)] bg-black/70 px-1.5 py-0.5 font-medium text-white", skin.typography.badge)}>{formatDuration(material.duration)}</span>
      </div>
      <div className={cn("block min-w-0 w-full text-left", compact ? "p-2" : "p-3")} onClick={() => onOpen(material)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className={cn("truncate", skin.textDensity.id)}>{material.materialId}</p>
            <p className={cn("mt-1 min-w-0 break-words line-clamp-2", skin.textDensity.cardFileName)}>{material.storedFileName}</p>
          </div>
          {!compact ? <MaterialActionMenu material={material} onAction={onAction} canManage={canManage} /> : null}
        </div>
        <div className={cn("mt-2 flex min-w-0 flex-wrap items-center gap-1.5", compact && "mt-1")}>
          <StatusPill tone={materialStatusTone(material.status)} className={compact ? "px-1.5 py-0" : undefined}>{materialStatusLabel(material.status)}</StatusPill>
          {!compact ? <StatusPill tone="neutral" className="max-w-full truncate">{shortCategory(material.primaryCategory)}</StatusPill> : null}
          {!compact ? <StatusPill tone="neutral">{material.shooterName || material.uploaderName || "未填写"}</StatusPill> : null}
          <ConfidenceBadge value={material.aiConfidence} className="px-1.5 py-0" />
        </div>
        <MaterialIssueBadges material={material} limit={compact ? 2 : 3} className="mt-2" badgeClassName={compact ? "px-1.5 py-0" : undefined} />
        {view === "large" ? <p className={cn("mt-2 line-clamp-2", skin.textDensity.technical)}>{material.aiSummary || "暂无摘要"}</p> : null}
      </div>
    </article>
  );
}

function MaterialActionMenu({
  material,
  onAction,
  canManage
}: {
  material: MaterialDto;
  onAction: (action: string, material: MaterialDto) => void;
  canManage: boolean;
}) {
  const items = getMaterialActionItems(material, onAction, canManage);
  return (
    <ActionMenu
      items={items}
      ariaLabel="素材操作"
      width={252}
      trigger={({ ref, open, toggle }) => (
        <button
          ref={ref}
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--skin-radius-sm)] text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]"
          aria-label="打开素材操作"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            toggle();
          }}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
    />
  );
}

function getMaterialActionItems(material: MaterialDto, onAction: (action: string, material: MaterialDto) => void, canManage: boolean): ActionMenuItem[] {
  return [
    { label: "预览", icon: Play, onSelect: () => onAction("preview", material), tone: "primary" },
    canManage ? { label: "应用建议", icon: CheckCircle2, onSelect: () => onAction("applyAiSuggestion", material), tone: "primary" } : null,
    canManage ? { label: "改名", icon: FilePenLine, onSelect: () => onAction("rename", material) } : null,
    canManage ? { label: "分类", icon: FolderInput, onSelect: () => onAction("move", material) } : null,
    canManage ? { label: "标签", icon: Tags, onSelect: () => onAction("tags", material) } : null,
    canManage ? { label: "重新识别", icon: RefreshCcw, onSelect: () => onAction("reanalyze", material) } : null,
    canManage ? { label: "重建缩略图/预览", icon: ImagePlus, onSelect: () => onAction("regenerateDerivatives", material) } : null,
    { label: "加入精选包", icon: PackagePlus, onSelect: () => onAction("package", material) },
    { label: "下载", icon: Download, href: `/api/materials/${material.id}/download` },
    canManage ? { label: "删除", icon: Trash2, onSelect: () => onAction("trash", material), tone: "danger" } : null
  ].filter(Boolean) as ActionMenuItem[];
}

function LibraryTable(props: {
  materials: MaterialDto[];
  selectedIds: string[];
  canSelect: boolean;
  canManage: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onOpen: (material: MaterialDto) => void;
  onPreview: (material: MaterialDto) => void;
  onAction: (action: string, material: MaterialDto) => void;
}) {
  return (
    <ResponsiveTableShell className="max-w-full">
      <table className={cn("w-full min-w-[980px]", skin.typography.tableCell)}>
        <thead className={cn(skin.table.header, "sticky top-0 z-10")}>
          <tr>
            {props.canSelect ? <th className="w-12 px-3 py-2 text-left">选择</th> : null}
            <th className="px-3 py-2 text-left">缩略图</th>
            <th className="px-3 py-2 text-left">{terms.material.idLabel}</th>
            <th className="px-3 py-2 text-left">文件名</th>
            <th className="px-3 py-2 text-left">{terms.category.singular}</th>
            <th className="px-3 py-2 text-left">{terms.shooter.singular}</th>
            <th className="px-3 py-2 text-left">问题</th>
            <th className="px-3 py-2 text-left">置信度</th>
            <th className="px-3 py-2 text-left">状态</th>
            <th className="px-3 py-2 text-left">上传时间</th>
            <th className="px-3 py-2 text-left">操作</th>
          </tr>
        </thead>
        <tbody>
          {props.materials.map((material) => (
            <tr key={material.id} className={skin.table.row}>
              {props.canSelect ? <td className="px-3 py-2 align-middle"><input className="h-4 w-4" type="checkbox" checked={props.selectedIds.includes(material.id)} onChange={(event) => props.onSelect(material.id, event.target.checked)} /></td> : null}
              <td className="px-3 py-2">
                <button type="button" className={cn(skin.media.thumbnail, "h-14 w-20")} onClick={() => props.onPreview(material)}>
                  {material.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-full w-full object-cover" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
                  ) : (
                    <MediaPlaceholder type={fileTypeFromMime(material.mimeType)} label="" size="sm" />
                  )}
                </button>
              </td>
              <td className={cn("whitespace-nowrap px-3 py-2", skin.textDensity.id)}>{material.materialId}</td>
              <td className="max-w-[300px] px-3 py-2"><button type="button" className={cn("line-clamp-2 text-left hover:text-primary", skin.textDensity.tableFileName)} onClick={() => props.onOpen(material)}>{material.storedFileName}</button></td>
              <td className={cn("max-w-[180px] truncate px-3 py-2", skin.textDensity.technical)}>{material.primaryCategory}</td>
              <td className={cn("whitespace-nowrap px-3 py-2", skin.textDensity.technical)}>{material.shooterName || material.uploaderName || "-"}</td>
              <td className="min-w-[160px] px-3 py-2"><MaterialIssueBadges material={material} limit={3} /></td>
              <td className="px-3 py-2"><ConfidenceBadge value={material.aiConfidence} /></td>
              <td className="px-3 py-2"><StatusPill tone={materialStatusTone(material.status)}>{materialStatusLabel(material.status)}</StatusPill></td>
              <td className={cn("whitespace-nowrap px-3 py-2", skin.textDensity.technical)}>{toLocalDateTime(material.createdAt)}</td>
              <td className="px-3 py-2"><MaterialActionMenu material={material} onAction={props.onAction} canManage={props.canManage} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTableShell>
  );
}

function MaterialDetailPanel({
  material,
  onPreview,
  onAction
}: {
  material: MaterialDto | null;
  onPreview: (material: MaterialDto) => void;
  onAction: (action: string, material: MaterialDto) => void;
}) {
  const [tab, setTab] = useState<"basic" | "ai" | "tags" | "logs">("basic");

  if (!material) {
    return (
      <aside className={cn("rounded-xl border bg-white p-5 text-muted-foreground shadow-sm", skin.typography.body)}>
        <h2 className={skin.typography.panelTitle}>{terms.material.detail}</h2>
        <div className="mt-28 rounded-xl border border-dashed p-8 text-center">请选择一个{terms.material.singular}查看详情</div>
      </aside>
    );
  }

  const isImage = material.mimeType?.startsWith("image/");
  return (
    <aside className="sticky top-3 h-[calc(100vh-128px)] overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex h-full flex-col">
        <div className="border-b p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{terms.material.detail}</h2>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <button type="button" className="relative block w-full overflow-hidden rounded-lg bg-black" onClick={() => onPreview(material)}>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="max-h-56 w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/preview`} />
            ) : (
              <video className="max-h-56 w-full object-contain" src={`/api/materials/${material.id}/preview`} />
            )}
            <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 p-3 text-white"><Play className="h-5 w-5 fill-current" /></span></span>
          </button>
        </div>
        <div className="flex border-b px-4">
          {[
            ["basic", "基础信息"],
            ["ai", "AI 识别"],
            ["tags", "标签"],
            ["logs", "操作日志"]
          ].map(([value, label]) => (
            <button key={value} type="button" className={cn("border-b-2 px-2 py-3", skin.typography.bodyDense, tab === value ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground")} onClick={() => setTab(value as typeof tab)}>
              {label}
            </button>
          ))}
        </div>
        <div className="thin-scrollbar flex-1 overflow-auto p-4">
          {tab === "basic" ? <BasicDetail material={material} /> : null}
          {tab === "ai" ? <AiDetail material={material} /> : null}
          {tab === "tags" ? <TagsDetail material={material} /> : null}
          {tab === "logs" ? <LogsDetail material={material} /> : null}
        </div>
        <div className="flex gap-2 border-t p-4">
          <Button variant="secondary" className="flex-1" onClick={() => onPreview(material)}>预览</Button>
          <Button className="flex-1" onClick={() => onAction("tags", material)}>编辑</Button>
          <div className="flex-1"><MaterialActionMenu material={material} onAction={onAction} canManage /></div>
        </div>
      </div>
    </aside>
  );
}

function BasicDetail({ material }: { material: MaterialDto }) {
  return (
    <div className={cn("space-y-3", skin.typography.bodyDense)}>
      <DetailRow label={terms.material.idLabel} value={material.materialId} copy />
      <DetailRow label="文件名" value={material.storedFileName} copy />
      <DetailRow label="原始文件名" value={material.originalFileName} />
      <DetailRow label="当前目录" value={material.primaryCategory || material.relativePath} />
      <DetailRow label={terms.shooter.singular} value={material.shooterName || material.uploaderName || "-"} />
      <DetailRow label="上传时间" value={toLocalDateTime(material.createdAt)} />
      <DetailRow label="文件大小" value={formatFileSize(material.fileSize)} />
      <DetailRow label="时长" value={formatDuration(material.duration)} />
      <DetailRow label="分辨率" value={material.width && material.height ? `${material.width} x ${material.height}` : "-"} />
      <div className="grid grid-cols-[88px_1fr] gap-3"><span className="text-muted-foreground">置信度</span><ConfidenceBadge value={material.aiConfidence} /></div>
      <div className="grid grid-cols-[88px_1fr] gap-3"><span className="text-muted-foreground">状态</span><StatusBadge status={material.status} /></div>
      <DetailRow label="横竖屏" value={material.orientation || "-"} />
      <DetailRow label="文件类型" value={material.mimeType || "-"} />
    </div>
  );
}

function AiDetail({ material }: { material: MaterialDto }) {
  return (
    <div className={cn("space-y-3", skin.typography.bodyDense)}>
      <DetailRow label="主体" value={material.subject || "-"} />
      <DetailRow label="场景" value={material.scene || "-"} />
      <DetailRow label="动作" value={material.action || "-"} />
      <DetailRow label="用途" value={material.usage || "-"} />
      <DetailBlock label="摘要" value={material.aiSummary || "-"} />
      <DetailRow label="建议目录" value={[material.aiSuggestedRootCategory, material.aiSuggestedSubCategory].filter(Boolean).join(" / ") || "-"} />
      <DetailRow label="冲突原因" value={material.conflictReason || "-"} />
    </div>
  );
}

function TagsDetail({ material }: { material: MaterialDto }) {
  const tags = [
    ...toStringTags(material.customTags),
    ...toStringTags(material.aiEmotionTags),
    ...toStringTags(material.aiUsageTags),
    ...toStringTags(material.aiSceneTags),
    ...toStringTags(material.aiSubjectTags),
    ...toStringTags(material.aiActionTags),
    ...toStringTags(material.visualTags)
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {tags.length ? tags.map((tag) => <span key={tag} className={cn("rounded-full border bg-slate-50 px-2 py-1 text-slate-700", skin.typography.badge)}>{tag}</span>) : <span className={cn("text-muted-foreground", skin.typography.body)}>暂无标签</span>}
    </div>
  );
}

function LogsDetail({ material }: { material: MaterialDto }) {
  return (
    <div className="space-y-3">
      {material.operationLogs?.length ? material.operationLogs.map((log) => (
        <div key={log.id} className={cn("rounded-lg border bg-slate-50 p-3", skin.typography.technical)}>
          <p className="font-semibold">{log.operationType}</p>
          <p className="mt-1 text-muted-foreground">{toLocalDateTime(log.createdAt)}</p>
          {log.notes ? <p className="mt-1 text-slate-600">{log.notes}</p> : null}
        </div>
      )) : <p className={cn("text-muted-foreground", skin.typography.body)}>暂无操作日志</p>}
    </div>
  );
}

function DetailRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-1 font-medium">
        <span className="truncate">{value}</span>
        {copy ? <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
      </span>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-muted-foreground">{label}</p>
      <p className="rounded-lg bg-slate-50 p-3 leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function LibraryEmptyState({
  selection,
  hasQuery,
  hasFilters
}: {
  selection: DirectorySelection;
  hasQuery: boolean;
  hasFilters: boolean;
}) {
  const state = getEmptyState(selection, hasQuery, hasFilters);
  const Icon = state.icon;

  return (
    <EmptyState
      icon={Icon}
      title={state.title}
      description={
        <>
          <p>{state.description}</p>
          {hasQuery || hasFilters || selection.type !== "all" ? (
            <p className={cn("mt-3", skin.typography.meta)}>可以切换目录、清空筛选，或搜索{terms.material.idLabel}、文件名、标签、摘要和{terms.shooter.singular}。</p>
          ) : null}
        </>
      }
    />
  );
}

function getEmptyState(selection: DirectorySelection, hasQuery: boolean, hasFilters: boolean) {
  if (hasQuery || hasFilters) {
    return {
      icon: Search,
      title: "没有匹配的搜索结果",
      description: "当前搜索词或筛选条件下没有素材。"
    };
  }
  if (selection.type === "category") {
    return {
      icon: Folder,
      title: "当前栏目暂无素材",
      description: `“${selection.label}” 下暂时没有可显示的素材。`
    };
  }
  if (selection.type === "recent") {
    return {
      icon: Clock3,
      title: "最近暂无素材",
      description: "近 7 天没有符合条件的素材。"
    };
  }
  if (selection.type === "unorganized") {
    return {
      icon: FileText,
      title: "暂无待整理素材",
      description: "当前没有处于待整理状态的素材。"
    };
  }
  return {
    icon: Grid2X2,
    title: terms.material.empty,
    description: "素材库还没有可显示的素材。"
  };
}

function BatchActionBar({
  count,
  canManage,
  onMove,
  onEditTags,
  onExportJson,
  onExportCsv,
  onDownloadOriginals,
  onDownloadPreviews,
  onAddToPackage,
  onCreatePackage,
  onReanalyze,
  onTrash,
  onCancel
}: {
  count: number;
  canManage: boolean;
  onMove: () => void;
  onEditTags: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onDownloadOriginals: () => void;
  onDownloadPreviews: () => void;
  onAddToPackage: () => void;
  onCreatePackage: () => void;
  onReanalyze: () => void;
  onTrash: () => void;
  onCancel: () => void;
}) {
  return (
    <div className={skin.responsive.mobileActionBar}>
      <StatusPill tone="info" withDot className="shrink-0">已选择 {count} 个{terms.material.singular}</StatusPill>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="default" size="sm" onClick={onDownloadOriginals}>
          <Download className="mr-1 h-3.5 w-3.5" /> 下载原文件包
        </Button>
        <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onDownloadPreviews}>
          <Download className="mr-1 h-3.5 w-3.5" /> 下载预览包
        </Button>
        <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onExportCsv}>
          <Download className="mr-1 h-3.5 w-3.5" /> 导出 CSV
        </Button>
        <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onExportJson}>
          <PackagePlus className="mr-1 h-3.5 w-3.5" /> 导出 JSON
        </Button>
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onAddToPackage}><PackagePlus className="mr-1 h-3.5 w-3.5" /> 加入已有精选包</Button> : null}
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onCreatePackage}><PackagePlus className="mr-1 h-3.5 w-3.5" /> 新建精选包并加入</Button> : null}
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onMove}>批量移动</Button> : null}
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onEditTags}>批量编辑标签</Button> : null}
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" onClick={onReanalyze}><RefreshCcw className="mr-1 h-3.5 w-3.5" /> 批量重新识别</Button> : null}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 border-t border-[color:var(--skin-border-subtle)] pt-2 sm:w-auto sm:border-t-0 sm:pt-0">
        <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="ghost" size="sm" onClick={onCancel}><X className="mr-1 h-3.5 w-3.5" /> 取消选择</Button>
        {canManage ? <Button className="min-h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="destructive" size="sm" onClick={onTrash}><Trash2 className="mr-1 h-3.5 w-3.5" /> 批量删除</Button> : null}
      </div>
    </div>
  );
}

function PackageSelectionDialog({
  state,
  packages,
  busy,
  onClose,
  onLoadPackages,
  onAdd,
  onCreate
}: {
  state: NonNullable<PackageDialogState>;
  packages: PackageOptionDto[];
  busy: string;
  onClose: () => void;
  onLoadPackages: () => void;
  onAdd: (packageId: string) => Promise<boolean>;
  onCreate: (payload: { name: string; purpose?: string; notes?: string }) => Promise<boolean>;
}) {
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [form, setForm] = useState({ name: "", purpose: "", notes: "" });

  useEffect(() => {
    if (state.type !== "existing") return;
    if (!selectedPackageId && packages[0]) setSelectedPackageId(packages[0].packageId);
  }, [packages, selectedPackageId, state.type]);

  async function submitExisting() {
    if (!selectedPackageId) return;
    await onAdd(selectedPackageId);
  }

  async function submitCreate() {
    if (!form.name.trim()) return;
    await onCreate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--skin-overlay)] p-4">
      <Panel className="w-full max-w-[var(--skin-modal-width-md)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className={skin.typography.panelTitle}>{state.type === "existing" ? "加入已有精选包" : "新建精选包并加入"}</h3>
            <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>本次将处理 {state.ids.length} 个已选素材。</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {state.type === "existing" ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select className="min-w-0 flex-1" value={selectedPackageId} onChange={(event) => setSelectedPackageId(event.target.value)}>
                {packages.map((pkg) => (
                  <option key={pkg.packageId} value={pkg.packageId}>
                    {pkg.name} · {pkg.packageId} · {pkg.itemCount} 个素材
                  </option>
                ))}
              </Select>
              <Button variant="secondary" onClick={onLoadPackages}><RefreshCcw className="mr-1.5 h-4 w-4" /> 刷新</Button>
            </div>
            {!packages.length ? <Surface tone="muted" padding="sm" className={cn(skin.typography.meta, "text-muted-foreground")}>还没有使用中的精选包，可以切换为新建后加入。</Surface> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button disabled={!selectedPackageId || busy === "package-add"} onClick={submitExisting}>加入精选包</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Input value={form.name} placeholder="包名称" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            <Input value={form.purpose} placeholder="用途" onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} />
            <Textarea value={form.notes} placeholder="备注" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button disabled={!form.name.trim() || busy === "package-create" || busy === "package-add"} onClick={submitCreate}>创建并加入</Button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function downloadFileName(contentDisposition: string | null, fallback: string) {
  if (!contentDisposition) return fallback;
  const match = /filename\*=UTF-8''([^;]+)/.exec(contentDisposition);
  if (!match?.[1]) return fallback;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return fallback;
  }
}

function hasActiveLibraryFilters(status: string, uploader: string, dateRange: string, confidence: string, issue: string) {
  return status !== "ALL" || uploader !== "ALL" || dateRange !== "ALL" || confidence !== "ALL" || issue !== "ALL";
}

function materialStatusTone(status: string) {
  if (["READY", "IMPORTED"].includes(status)) return "success";
  if (["UPLOADED", "PROCESSING", "AI_TAGGED"].includes(status)) return "processing";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "FAILED") return "danger";
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

function shortCategory(category?: string | null) {
  if (!category) return "-";
  const parts = category.split("/");
  return parts.at(-1)?.replace(/^\d+_/, "") || category;
}

function formatDuration(value?: number | null) {
  if (!value) return "00:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatFileSize(value?: number | null) {
  if (!value) return "-";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function getFromDate(dateRange: string) {
  if (dateRange === "ALL") return "";
  const date = new Date();
  const days = dateRange === "TODAY" ? 1 : dateRange === "7D" ? 7 : 30;
  date.setDate(date.getDate() - days + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function toStringTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

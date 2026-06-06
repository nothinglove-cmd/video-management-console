"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Download, FileJson, PackagePlus, RefreshCcw, Search, Trash2 } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatBytes, formatDuration, toLocalDateTime } from "@/lib/utils";

type PackageStatus = "ACTIVE" | "ARCHIVED" | "DELETED";

type PackageListItemDto = {
  id: string;
  packageId: string;
  name: string;
  purpose?: string | null;
  description?: string | null;
  notes?: string | null;
  status: PackageStatus;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  finishedWorkCount?: number;
  totalSize: number;
};

type PackageMaterialDto = {
  id: string;
  materialId: string;
  storedFileName: string;
  originalFileName: string;
  fileSize: number;
  mimeType?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  shooterName?: string | null;
  uploaderName?: string | null;
  primaryCategory: string;
  categoryPath?: string | null;
  status: string;
  createdAt: string;
};

type PackageItemDto = {
  id: string;
  materialId: string;
  sortOrder: number;
  notes?: string | null;
  createdAt: string;
  material: PackageMaterialDto;
};

type PackageDetailDto = PackageListItemDto & {
  items: PackageItemDto[];
  finishedWorks: Array<{
    id: string;
    workId: string;
    title: string;
    status: string;
    platform?: string | null;
    publishTitle?: string | null;
    publishUrl?: string | null;
    publishedAt?: string | null;
    accountName?: string | null;
    projectName?: string | null;
    versionName?: string | null;
    isPublished: boolean;
  }>;
};

const STATUS_OPTIONS = [
  ["ALL", "全部状态"],
  ["ACTIVE", "使用中"],
  ["ARCHIVED", "已归档"]
];

export function MaterialPackageWorkbench({ initialPackageId }: { initialPackageId?: string }) {
  const [packages, setPackages] = useState<PackageListItemDto[]>([]);
  const [activePackageId, setActivePackageId] = useState(initialPackageId || "");
  const [detail, setDetail] = useState<PackageDetailDto | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ name: "", purpose: "", notes: "" });
  const metrics = useMemo(() => buildMetrics(packages), [packages]);

  useEffect(() => {
    loadPackages().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, [submittedQuery, status]);

  async function loadPackages() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "200" });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    if (status !== "ALL") params.set("status", status);

    const response = await fetch(`/api/packages?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { packages?: PackageListItemDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "精选包列表读取失败。");

    const next = data.packages || [];
    setPackages(next);
    setLoading(false);

    const nextActive = activePackageId && next.some((item) => item.packageId === activePackageId || item.id === activePackageId)
      ? activePackageId
      : initialPackageId || next[0]?.packageId || "";
    if (nextActive) {
      await openPackage(nextActive, true);
    } else {
      setActivePackageId("");
      setDetail(null);
    }
  }

  async function openPackage(id: string, silent = false) {
    if (!silent) setMessage("");
    setDetailLoading(true);
    const response = await fetch(`/api/packages/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { package?: PackageDetailDto; error?: string } | null;
    setDetailLoading(false);
    if (!response.ok || !data?.package) {
      setMessage(data?.error || "精选包详情读取失败。");
      return;
    }
    setActivePackageId(data.package.packageId);
    setDetail(data.package);
  }

  async function createPackage() {
    if (!form.name.trim()) {
      setMessage("请填写精选包名称。");
      return;
    }
    setBusy("create");
    setMessage("");
    const response = await fetch("/api/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => null) as { package?: PackageListItemDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.package) {
      setMessage(data?.error || "创建精选包失败。");
      return;
    }
    setForm({ name: "", purpose: "", notes: "" });
    setActivePackageId(data.package.packageId);
    setMessage(`已创建精选包：${data.package.name}`);
    await loadPackages();
    await openPackage(data.package.packageId, true);
  }

  async function patchPackage(payload: Partial<Pick<PackageDetailDto, "name" | "purpose" | "notes" | "status">>) {
    if (!detail) return;
    setBusy("patch");
    const response = await fetch(`/api/packages/${encodeURIComponent(detail.packageId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null) as { package?: PackageDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.package) {
      setMessage(data?.error || "更新精选包失败。");
      return;
    }
    setDetail(data.package);
    setMessage("精选包已更新。");
    await loadPackages();
  }

  async function removeItem(item: PackageItemDto) {
    if (!detail) return;
    setBusy(item.id);
    const response = await fetch(`/api/packages/${encodeURIComponent(detail.packageId)}/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => null) as { package?: PackageDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.package) {
      setMessage(data?.error || "移除素材失败。");
      return;
    }
    setDetail(data.package);
    setMessage(`已从精选包移除：${item.material.materialId}`);
    await loadPackages();
  }

  async function reorder(item: PackageItemDto, direction: -1 | 1) {
    if (!detail) return;
    const items = detail.items.slice();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    setBusy("reorder");
    const response = await fetch(`/api/packages/${encodeURIComponent(detail.packageId)}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: items.map((candidate) => candidate.id) })
    });
    const data = await response.json().catch(() => null) as { package?: PackageDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.package) {
      setMessage(data?.error || "排序失败。");
      return;
    }
    setDetail(data.package);
  }

  function submitSearch() {
    setSubmittedQuery(query.trim());
  }

  function openDownload(variant: "original" | "preview") {
    if (!detail) return;
    const params = new URLSearchParams({ variant });
    window.open(`/api/packages/${encodeURIComponent(detail.packageId)}/download?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  function openExport(format: "json" | "csv") {
    if (!detail) return;
    const params = new URLSearchParams({ format });
    window.open(`/api/packages/${encodeURIComponent(detail.packageId)}/export?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div style={skin.vars} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="精选包" value={String(metrics.total)} helper="未删除包" />
        <Metric label="使用中素材" value={String(metrics.itemCount)} helper="包内素材条目" />
        <Metric label="总大小" value={formatBytes(metrics.totalSize)} helper="按包内素材统计" />
      </div>

      <Panel className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div>
            <h2 className={skin.typography.panelTitle}>创建精选包</h2>
            <p className={cn("mt-1", skin.typography.meta)}>用于长期管理剪辑交付包、投放素材包或专题素材集合。</p>
          </div>
          <Input value={form.name} placeholder="包名称" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          <Input value={form.purpose} placeholder="用途，例如：6 月直播切片 / 门店投放素材" onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} />
          <Textarea value={form.notes} placeholder="备注" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          <Button disabled={busy === "create"} onClick={createPackage}>
            <PackagePlus className="mr-1.5 h-4 w-4" /> 新建精选包
          </Button>
        </section>

        <section className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative min-w-0">
              <Input
                value={query}
                placeholder="搜索包编号、名称、用途、备注"
                className="pr-10"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
              />
              <button type="button" className="absolute right-2 top-2 rounded-[var(--skin-radius-sm)] p-1 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]" onClick={submitSearch} aria-label="搜索精选包">
                <Search className="h-4 w-4" />
              </button>
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => loadPackages().catch((error) => setMessage(error.message))}>
              <RefreshCcw className="mr-1.5 h-4 w-4" /> 刷新
            </Button>
          </div>

          {message ? <Surface tone="muted" padding="sm" className={cn(skin.typography.meta, "text-muted-foreground")}>{message}</Surface> : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((pkg) => (
              <button
                key={pkg.packageId}
                type="button"
                className={cn(
                  "rounded-[var(--skin-radius-card)] border p-3 text-left transition hover:bg-[color:var(--skin-surface-hover)]",
                  pkg.packageId === activePackageId ? "border-primary bg-[color:var(--skin-surface-selected)]" : "border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)]"
                )}
                onClick={() => openPackage(pkg.packageId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("truncate font-semibold", skin.typography.bodyDense)}>{pkg.name}</p>
                    <p className={cn("mt-1", skin.textDensity.id)}>{pkg.packageId}</p>
                  </div>
                  <StatusPill tone={packageStatusTone(pkg.status)}>{packageStatusLabel(pkg.status)}</StatusPill>
                </div>
                <p className={cn("mt-2 line-clamp-2 text-muted-foreground", skin.typography.meta)}>{pkg.purpose || pkg.notes || "未填写用途"}</p>
                <div className={cn("mt-3 flex flex-wrap gap-2 text-muted-foreground", skin.typography.meta)}>
                  <span>{pkg.itemCount} 个素材</span>
                  <span>{formatBytes(pkg.totalSize)}</span>
                  <span>{toLocalDateTime(pkg.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
          {!loading && !packages.length ? <EmptyState title="暂无精选包" description="创建第一个精选包后，可以从素材库多选加入素材。" /> : null}
        </section>
      </Panel>

      <Panel className="space-y-3">
        {!detail && detailLoading ? <Surface tone="muted">正在读取精选包详情...</Surface> : null}
        {!detail && !detailLoading ? <EmptyState title="未选择精选包" description="从上方列表选择一个精选包查看素材和下载入口。" /> : null}
        {detail ? (
          <>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn("break-words", skin.typography.panelTitle)}>{detail.name}</h2>
                  <StatusPill tone={packageStatusTone(detail.status)} withDot>{packageStatusLabel(detail.status)}</StatusPill>
                  <p className={skin.textDensity.id}>{detail.packageId}</p>
                </div>
                <p className={cn("mt-1 text-muted-foreground", skin.typography.bodyDense)}>{detail.purpose || "未填写用途"}</p>
                {detail.notes ? <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{detail.notes}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="default" size="sm" onClick={() => openDownload("original")}><Download className="mr-1.5 h-4 w-4" /> 原文件包</Button>
                <Button variant="secondary" size="sm" onClick={() => openDownload("preview")}><Download className="mr-1.5 h-4 w-4" /> 预览包</Button>
                <Button variant="secondary" size="sm" onClick={() => openExport("csv")}><FileJson className="mr-1.5 h-4 w-4" /> CSV</Button>
                <Button variant="secondary" size="sm" onClick={() => openExport("json")}><FileJson className="mr-1.5 h-4 w-4" /> JSON</Button>
                {detail.status === "ARCHIVED" ? (
                  <Button variant="secondary" size="sm" onClick={() => patchPackage({ status: "ACTIVE" })}>恢复</Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => patchPackage({ status: "ARCHIVED" })}><Archive className="mr-1.5 h-4 w-4" /> 归档</Button>
                )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <Metric label="素材数" value={String(detail.itemCount)} helper="PackageItem" />
              <Metric label="包大小" value={formatBytes(detail.totalSize)} helper="原文件大小合计" />
              <Metric label="转成片" value={String(detail.finishedWorks.length)} helper="关联成片/交付件" />
            </div>

            {detail.finishedWorks.length ? (
              <Surface tone="raised" padding="sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className={skin.typography.panelTitle}>关联成片</p>
                  <p className={cn("text-muted-foreground", skin.typography.meta)}>这个精选包已进入以下成片/交付件</p>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {detail.finishedWorks.map((work) => (
                    <div key={work.workId} className="rounded-[var(--skin-radius-card)] border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link className={cn("font-semibold text-primary hover:underline", skin.typography.bodyDense)} href={`/admin/finished-works/${encodeURIComponent(work.workId)}`}>
                          {work.title}
                        </Link>
                        <StatusPill tone={finishedWorkStatusTone(work.status, work.isPublished)}>{work.isPublished ? "已发布" : finishedWorkStatusLabel(work.status)}</StatusPill>
                      </div>
                      <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>
                        {[work.platform, work.projectName, work.accountName, work.versionName].filter(Boolean).join(" / ") || "未填写发布信息"}
                      </p>
                      <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>
                        {work.publishedAt ? toLocalDateTime(work.publishedAt) : "未记录发布时间"}
                      </p>
                      {work.publishUrl ? (
                        <a className={cn("mt-1 block truncate text-primary hover:underline", skin.typography.meta)} href={work.publishUrl} target="_blank" rel="noreferrer">
                          {work.publishTitle || work.publishUrl}
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Surface>
            ) : (
              <Surface tone="muted" padding="sm" className={cn(skin.typography.meta, "text-muted-foreground")}>
                暂无成片/交付件关联这个精选包。
              </Surface>
            )}

            {detail.items.length ? (
              <ResponsiveTableShell className="max-w-full">
                <table className="min-w-[980px] w-full border-collapse">
                  <thead className={skin.table.header}>
                    <tr>
                      <th className="px-3 py-2 text-left">素材</th>
                      <th className="px-3 py-2 text-left">分类</th>
                      <th className="px-3 py-2 text-left">大小 / 时长</th>
                      <th className="px-3 py-2 text-left">拍摄人</th>
                      <th className="px-3 py-2 text-left">加入时间</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, index) => (
                      <tr key={item.id} className={skin.table.row}>
                        <td className="px-3 py-2 align-top">
                          <Link href={`/admin/library?material=${encodeURIComponent(item.material.id)}`} className={cn("font-medium hover:text-primary", skin.typography.tableCell)}>
                            {item.material.storedFileName}
                          </Link>
                          <p className={skin.textDensity.id}>{item.material.materialId}</p>
                          <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{item.material.originalFileName}</p>
                        </td>
                        <td className={cn("px-3 py-2 align-top", skin.typography.tableCell)}>
                          <p>{item.material.primaryCategory || "-"}</p>
                          <p className={skin.typography.meta}>{item.material.categoryPath || "-"}</p>
                        </td>
                        <td className={cn("px-3 py-2 align-top", skin.typography.tableCell)}>
                          <p>{formatBytes(item.material.fileSize)}</p>
                          <p className={skin.typography.meta}>
                            {formatDuration(item.material.duration)} · {item.material.width || "-"}x{item.material.height || "-"}
                          </p>
                        </td>
                        <td className={cn("px-3 py-2 align-top", skin.typography.tableCell)}>{item.material.shooterName || item.material.uploaderName || "-"}</td>
                        <td className={cn("px-3 py-2 align-top", skin.typography.tableCell)}>{toLocalDateTime(item.createdAt)}</td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="sm" disabled={index === 0 || busy === "reorder"} onClick={() => reorder(item, -1)} aria-label="上移">
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" disabled={index === detail.items.length - 1 || busy === "reorder"} onClick={() => reorder(item, 1)} aria-label="下移">
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" disabled={busy === item.id} onClick={() => removeItem(item)} aria-label="移除">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ResponsiveTableShell>
            ) : (
              <EmptyState title="精选包内暂无素材" description="在素材库中多选素材后，使用加入已有精选包或新建精选包并加入。" />
            )}
          </>
        ) : null}
      </Panel>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Surface tone="raised" padding="sm">
      <p className={skin.textDensity.label}>{label}</p>
      <p className={cn("mt-1 font-semibold", skin.typography.panelTitle)}>{value}</p>
      <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{helper}</p>
    </Surface>
  );
}

function buildMetrics(packages: PackageListItemDto[]) {
  return packages.reduce((result, item) => ({
    total: result.total + 1,
    itemCount: result.itemCount + item.itemCount,
    totalSize: result.totalSize + item.totalSize
  }), { total: 0, itemCount: 0, totalSize: 0 });
}

function packageStatusTone(status: PackageStatus): SkinStatusTone {
  if (status === "ACTIVE") return "success";
  if (status === "ARCHIVED") return "neutral";
  return "danger";
}

function packageStatusLabel(status: PackageStatus) {
  if (status === "ACTIVE") return "使用中";
  if (status === "ARCHIVED") return "已归档";
  return "已删除";
}

function finishedWorkStatusLabel(status: string) {
  if (status === "DRAFT") return "草稿";
  if (status === "IN_PROGRESS") return "制作中";
  if (status === "DELIVERED") return "已交付";
  if (status === "PUBLISHED") return "已发布";
  if (status === "ARCHIVED") return "已归档";
  return status;
}

function finishedWorkStatusTone(status: string, published: boolean): SkinStatusTone {
  if (published || status === "PUBLISHED" || status === "DELIVERED") return "success";
  if (status === "IN_PROGRESS") return "processing";
  if (status === "ARCHIVED") return "neutral";
  return "review";
}

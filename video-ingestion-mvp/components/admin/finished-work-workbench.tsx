"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowDown, ArrowUp, Clapperboard, PackageCheck, RefreshCcw, Search, Trash2 } from "lucide-react";

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

type FinishedWorkStatus = "DRAFT" | "IN_PROGRESS" | "DELIVERED" | "PUBLISHED" | "ARCHIVED";
type FinishedWorkRole = "MAIN_CLIP" | "B_ROLL" | "COVER" | "AUDIO" | "OTHER";

type PackageOptionDto = {
  id: string;
  packageId: string;
  name: string;
  status: string;
  itemCount: number;
};

type FinishedWorkListItemDto = {
  id: string;
  workId: string;
  title: string;
  platform?: string | null;
  purpose?: string | null;
  status: FinishedWorkStatus;
  packageId?: string | null;
  packageName?: string | null;
  publishTitle?: string | null;
  publishUrl?: string | null;
  publishedAt?: string | null;
  accountName?: string | null;
  projectName?: string | null;
  versionName?: string | null;
  coverMaterialId?: string | null;
  deliveryNotes?: string | null;
  isPublished: boolean;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
  materialCount: number;
  totalSize: number;
};

type WorkMaterialDto = {
  id: string;
  materialId: string;
  sourcePackageId?: string | null;
  role: FinishedWorkRole;
  sortOrder: number;
  notes?: string | null;
  createdAt: string;
  material: {
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
};

type FinishedWorkDetailDto = FinishedWorkListItemDto & {
  package?: {
    id: string;
    packageId: string;
    name: string;
    status: string;
    purpose?: string | null;
    description?: string | null;
  } | null;
  materials: WorkMaterialDto[];
};

const STATUS_OPTIONS: Array<[string, string]> = [
  ["ALL", "全部状态"],
  ["DRAFT", "草稿"],
  ["IN_PROGRESS", "制作中"],
  ["DELIVERED", "已交付"],
  ["PUBLISHED", "已发布"],
  ["ARCHIVED", "已归档"]
];

const EDITABLE_STATUS_OPTIONS = STATUS_OPTIONS.filter(([value]) => value !== "ALL");

export function FinishedWorkWorkbench({ initialWorkId }: { initialWorkId?: string }) {
  const [works, setWorks] = useState<FinishedWorkListItemDto[]>([]);
  const [packages, setPackages] = useState<PackageOptionDto[]>([]);
  const [activeWorkId, setActiveWorkId] = useState(initialWorkId || "");
  const [detail, setDetail] = useState<FinishedWorkDetailDto | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    title: "",
    platform: "",
    purpose: "",
    projectName: "",
    accountName: "",
    versionName: "",
    publishTitle: "",
    publishUrl: "",
    publishedAt: "",
    packageId: "",
    notes: ""
  });
  const [publishForm, setPublishForm] = useState({
    projectName: "",
    accountName: "",
    versionName: "",
    publishTitle: "",
    publishUrl: "",
    publishedAt: "",
    coverMaterialId: "",
    deliveryNotes: "",
    notes: ""
  });
  const metrics = useMemo(() => buildMetrics(works), [works]);

  useEffect(() => {
    loadPackages().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    loadWorks().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, [submittedQuery, status]);

  async function loadPackages() {
    const response = await fetch("/api/packages?status=ACTIVE&limit=200", { cache: "no-store" });
    const data = await response.json().catch(() => null) as { packages?: PackageOptionDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "精选包列表读取失败。");
    setPackages(data.packages || []);
  }

  async function loadWorks() {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams({ limit: "200" });
    if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
    if (status !== "ALL") params.set("status", status);

    const response = await fetch(`/api/finished-works?${params.toString()}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { finishedWorks?: FinishedWorkListItemDto[]; error?: string } | null;
    if (!response.ok || !data) throw new Error(data?.error || "成片记录列表读取失败。");

    const next = data.finishedWorks || [];
    setWorks(next);
    setLoading(false);

    const nextActive = activeWorkId && next.some((item) => item.workId === activeWorkId || item.id === activeWorkId)
      ? activeWorkId
      : initialWorkId || next[0]?.workId || "";
    if (nextActive) {
      await openWork(nextActive, true);
    } else {
      setActiveWorkId("");
      setDetail(null);
    }
  }

  async function openWork(id: string, silent = false) {
    if (!silent) setMessage("");
    setDetailLoading(true);
    const response = await fetch(`/api/finished-works/${encodeURIComponent(id)}`, { cache: "no-store" });
    const data = await response.json().catch(() => null) as { finishedWork?: FinishedWorkDetailDto; error?: string } | null;
    setDetailLoading(false);
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "成片记录详情读取失败。");
      return;
    }
    setActiveWorkId(data.finishedWork.workId);
    setDetail(data.finishedWork);
    setPublishForm({
      projectName: data.finishedWork.projectName || "",
      accountName: data.finishedWork.accountName || "",
      versionName: data.finishedWork.versionName || "",
      publishTitle: data.finishedWork.publishTitle || "",
      publishUrl: data.finishedWork.publishUrl || "",
      publishedAt: toDateTimeLocalValue(data.finishedWork.publishedAt),
      coverMaterialId: data.finishedWork.coverMaterialId || "",
      deliveryNotes: data.finishedWork.deliveryNotes || "",
      notes: data.finishedWork.notes || ""
    });
  }

  async function createWork() {
    if (!form.title.trim()) {
      setMessage("请填写成片/交付件标题。");
      return;
    }
    setBusy("create");
    setMessage("");
    const response = await fetch("/api/finished-works", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        packageId: form.packageId || null
      })
    });
    const data = await response.json().catch(() => null) as { finishedWork?: FinishedWorkListItemDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "创建成片记录失败。");
      return;
    }
    setForm({
      title: "",
      platform: "",
      purpose: "",
      projectName: "",
      accountName: "",
      versionName: "",
      publishTitle: "",
      publishUrl: "",
      publishedAt: "",
      packageId: "",
      notes: ""
    });
    setActiveWorkId(data.finishedWork.workId);
    setMessage(`已创建成片记录：${data.finishedWork.title}`);
    await loadWorks();
    await openWork(data.finishedWork.workId, true);
  }

  async function patchWork(payload: Partial<Pick<FinishedWorkDetailDto, "title" | "platform" | "purpose" | "notes" | "status" | "packageId" | "publishTitle" | "publishUrl" | "publishedAt" | "accountName" | "projectName" | "versionName" | "coverMaterialId" | "deliveryNotes">>) {
    if (!detail) return;
    setBusy("patch");
    const response = await fetch(`/api/finished-works/${encodeURIComponent(detail.workId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null) as { finishedWork?: FinishedWorkDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "更新成片记录失败。");
      return;
    }
    setDetail(data.finishedWork);
    setMessage("成片记录已更新。");
    await loadWorks();
  }

  async function savePublishInfo() {
    await patchWork({
      ...publishForm,
      publishedAt: publishForm.publishedAt || null
    });
  }

  async function importPackageMaterials() {
    if (!detail?.packageId) {
      setMessage("当前成片记录还没有关联精选包。");
      return;
    }
    setBusy("import-package");
    const response = await fetch(`/api/finished-works/${encodeURIComponent(detail.workId)}/materials`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importPackage: true, role: "OTHER" })
    });
    const data = await response.json().catch(() => null) as {
      finishedWork?: FinishedWorkDetailDto;
      addedCount?: number;
      skippedCount?: number;
      error?: string;
    } | null;
    setBusy("");
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "导入精选包素材失败。");
      return;
    }
    setDetail(data.finishedWork);
    setMessage(`已导入精选包素材：新增 ${data.addedCount || 0} 个，已存在 ${data.skippedCount || 0} 个。`);
    await loadWorks();
  }

  async function removeItem(item: WorkMaterialDto) {
    if (!detail) return;
    setBusy(item.id);
    const response = await fetch(`/api/finished-works/${encodeURIComponent(detail.workId)}/materials/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    const data = await response.json().catch(() => null) as { finishedWork?: FinishedWorkDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "移除成片素材失败。");
      return;
    }
    setDetail(data.finishedWork);
    setMessage(`已从成片移除：${item.material.materialId}`);
    await loadWorks();
  }

  async function reorder(item: WorkMaterialDto, direction: -1 | 1) {
    if (!detail) return;
    const items = detail.materials.slice();
    const index = items.findIndex((candidate) => candidate.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    [items[index], items[targetIndex]] = [items[targetIndex], items[index]];
    setBusy("reorder");
    const response = await fetch(`/api/finished-works/${encodeURIComponent(detail.workId)}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemIds: items.map((candidate) => candidate.id) })
    });
    const data = await response.json().catch(() => null) as { finishedWork?: FinishedWorkDetailDto; error?: string } | null;
    setBusy("");
    if (!response.ok || !data?.finishedWork) {
      setMessage(data?.error || "排序失败。");
      return;
    }
    setDetail(data.finishedWork);
  }

  function submitSearch() {
    setSubmittedQuery(query.trim());
  }

  return (
    <div style={skin.vars} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="成片记录" value={String(metrics.total)} helper="当前筛选范围" />
        <Metric label="使用素材" value={String(metrics.materialCount)} helper="成片素材条目" />
        <Metric label="素材大小" value={formatBytes(metrics.totalSize)} helper="按成片素材统计" />
      </div>

      <Panel className="grid gap-3 lg:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <section className="space-y-3">
          <div>
            <h2 className={skin.typography.panelTitle}>创建成片/交付记录</h2>
            <p className={cn("mt-1", skin.typography.meta)}>记录一个剪辑成片、客户交付件、投放视频或发布版本实际使用了哪些素材。</p>
          </div>
          <Input value={form.title} placeholder="标题，例如：6 月直播间主推成片 A" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
          <Input value={form.platform} placeholder="平台，例如：抖音 / 视频号 / 客户交付" onChange={(event) => setForm((current) => ({ ...current, platform: event.target.value }))} />
          <Input value={form.purpose} placeholder="用途，例如：投放测试 / 客户复盘 / 发布版本" onChange={(event) => setForm((current) => ({ ...current, purpose: event.target.value }))} />
          <div className="grid gap-2 sm:grid-cols-3">
            <Input value={form.projectName} placeholder="项目" onChange={(event) => setForm((current) => ({ ...current, projectName: event.target.value }))} />
            <Input value={form.accountName} placeholder="账号 / 客户" onChange={(event) => setForm((current) => ({ ...current, accountName: event.target.value }))} />
            <Input value={form.versionName} placeholder="版本，例如 V1" onChange={(event) => setForm((current) => ({ ...current, versionName: event.target.value }))} />
          </div>
          <Input value={form.publishTitle} placeholder="发布标题" onChange={(event) => setForm((current) => ({ ...current, publishTitle: event.target.value }))} />
          <Input value={form.publishUrl} placeholder="发布链接" onChange={(event) => setForm((current) => ({ ...current, publishUrl: event.target.value }))} />
          <Input type="datetime-local" value={form.publishedAt} onChange={(event) => setForm((current) => ({ ...current, publishedAt: event.target.value }))} />
          <Select value={form.packageId} onChange={(event) => setForm((current) => ({ ...current, packageId: event.target.value }))}>
            <option value="">不关联精选包</option>
            {packages.map((pkg) => (
              <option key={pkg.packageId} value={pkg.packageId}>
                {pkg.name}（{pkg.itemCount}）
              </option>
            ))}
          </Select>
          <Textarea value={form.notes} placeholder="备注" onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
          <Button disabled={busy === "create"} onClick={createWork}>
            <Clapperboard className="mr-1.5 h-4 w-4" /> 新建成片记录
          </Button>
        </section>

        <section className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative min-w-0">
              <Input
                value={query}
                placeholder="搜索编号、标题、平台、用途、备注"
                className="pr-10"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitSearch();
                }}
              />
              <button type="button" className="absolute right-2 top-2 rounded-[var(--skin-radius-sm)] p-1 text-muted-foreground hover:bg-[color:var(--skin-surface-hover)]" onClick={submitSearch} aria-label="搜索成片记录">
                <Search className="h-4 w-4" />
              </button>
            </div>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Button variant="secondary" onClick={() => loadWorks().catch((error) => setMessage(error.message))}>
              <RefreshCcw className="mr-1.5 h-4 w-4" /> 刷新
            </Button>
          </div>

          {message ? <Surface tone="muted" padding="sm" className={cn(skin.typography.meta, "text-muted-foreground")}>{message}</Surface> : null}

          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {works.map((work) => (
              <button
                key={work.workId}
                type="button"
                className={cn(
                  "rounded-[var(--skin-radius-card)] border p-3 text-left transition hover:bg-[color:var(--skin-surface-hover)]",
                  work.workId === activeWorkId ? "border-primary bg-[color:var(--skin-surface-selected)]" : "border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)]"
                )}
                onClick={() => openWork(work.workId)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={cn("truncate font-semibold", skin.typography.bodyDense)}>{work.title}</p>
                    <p className={cn("mt-1", skin.textDensity.id)}>{work.workId}</p>
                  </div>
                  <StatusPill tone={finishedWorkStatusTone(work.status)}>{finishedWorkStatusLabel(work.status)}</StatusPill>
                </div>
                <p className={cn("mt-2 line-clamp-2 text-muted-foreground", skin.typography.meta)}>{[work.platform, work.projectName, work.accountName, work.versionName].filter(Boolean).join(" / ") || work.purpose || "未填写用途"}</p>
                <div className={cn("mt-3 flex flex-wrap gap-2 text-muted-foreground", skin.typography.meta)}>
                  <span>{work.materialCount} 个素材</span>
                  <span>{formatBytes(work.totalSize)}</span>
                  <span>{work.isPublished ? `已发布 ${work.publishedAt ? toLocalDateTime(work.publishedAt) : ""}` : "未发布"}</span>
                </div>
              </button>
            ))}
          </div>
          {!loading && !works.length ? <EmptyState title="暂无成片记录" description="创建成片记录后，可以从关联精选包导入实际使用素材。" /> : null}
        </section>
      </Panel>

      <Panel className="space-y-3">
        {!detail && detailLoading ? <Surface tone="muted">正在读取成片记录详情...</Surface> : null}
        {!detail && !detailLoading ? <EmptyState title="未选择成片记录" description="从上方列表选择一个成片或交付件，查看实际使用素材。" /> : null}
        {detail ? (
          <>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={cn("break-words", skin.typography.panelTitle)}>{detail.title}</h2>
                  <StatusPill tone={finishedWorkStatusTone(detail.status)} withDot>{finishedWorkStatusLabel(detail.status)}</StatusPill>
                  <StatusPill tone={detail.isPublished ? "success" : "neutral"} withDot>{detail.isPublished ? "已发布" : "未发布"}</StatusPill>
                  <p className={skin.textDensity.id}>{detail.workId}</p>
                </div>
                <p className={cn("mt-1 text-muted-foreground", skin.typography.bodyDense)}>{[detail.platform, detail.projectName, detail.accountName, detail.versionName, detail.purpose].filter(Boolean).join(" / ") || "未填写平台和用途"}</p>
                {detail.package ? (
                  <Link className={cn("mt-1 inline-block text-primary hover:underline", skin.typography.meta)} href={`/admin/packages/${encodeURIComponent(detail.package.packageId)}`}>
                    来源精选包：{detail.package.name}
                  </Link>
                ) : null}
                {detail.notes ? <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{detail.notes}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  className="w-auto min-w-32"
                  value={detail.status}
                  onChange={(event) => patchWork({ status: event.target.value as FinishedWorkStatus })}
                  disabled={busy === "patch"}
                >
                  {EDITABLE_STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
                <Button variant="secondary" size="sm" disabled={!detail.packageId || busy === "import-package"} onClick={importPackageMaterials}>
                  <PackageCheck className="mr-1.5 h-4 w-4" /> 导入精选包素材
                </Button>
                {detail.status === "ARCHIVED" ? (
                  <Button variant="secondary" size="sm" onClick={() => patchWork({ status: "DRAFT" })}>恢复草稿</Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => patchWork({ status: "ARCHIVED" })}><Archive className="mr-1.5 h-4 w-4" /> 归档</Button>
                )}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <Metric label="素材数" value={String(detail.materialCount)} helper="FinishedWorkMaterial" />
              <Metric label="素材大小" value={formatBytes(detail.totalSize)} helper="原文件大小合计" />
              <Metric label="创建人" value={detail.createdByName || "-"} helper={toLocalDateTime(detail.createdAt)} />
            </div>

            <Surface tone="raised" padding="sm">
              <div className="grid gap-2 lg:grid-cols-4">
                <Input value={publishForm.projectName} placeholder="项目" onChange={(event) => setPublishForm((current) => ({ ...current, projectName: event.target.value }))} />
                <Input value={publishForm.accountName} placeholder="账号 / 客户" onChange={(event) => setPublishForm((current) => ({ ...current, accountName: event.target.value }))} />
                <Input value={publishForm.versionName} placeholder="版本" onChange={(event) => setPublishForm((current) => ({ ...current, versionName: event.target.value }))} />
                <Input value={publishForm.coverMaterialId} placeholder="封面素材 ID" onChange={(event) => setPublishForm((current) => ({ ...current, coverMaterialId: event.target.value }))} />
                <Input className="lg:col-span-2" value={publishForm.publishTitle} placeholder="发布标题" onChange={(event) => setPublishForm((current) => ({ ...current, publishTitle: event.target.value }))} />
                <Input className="lg:col-span-2" value={publishForm.publishUrl} placeholder="发布链接" onChange={(event) => setPublishForm((current) => ({ ...current, publishUrl: event.target.value }))} />
                <Input type="datetime-local" value={publishForm.publishedAt} onChange={(event) => setPublishForm((current) => ({ ...current, publishedAt: event.target.value }))} />
                <Input className="lg:col-span-3" value={publishForm.deliveryNotes} placeholder="交付/发布备注" onChange={(event) => setPublishForm((current) => ({ ...current, deliveryNotes: event.target.value }))} />
                <Textarea className="lg:col-span-4" value={publishForm.notes} placeholder="内部备注" onChange={(event) => setPublishForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={busy === "patch"} onClick={savePublishInfo}>保存发布信息</Button>
                {detail.publishUrl ? (
                  <Button asChild variant="secondary" size="sm">
                    <a href={detail.publishUrl} target="_blank" rel="noreferrer">打开发布链接</a>
                  </Button>
                ) : null}
                <span className={cn("text-muted-foreground", skin.typography.meta)}>{detail.publishTitle || "未填写发布标题"}</span>
              </div>
            </Surface>

            {detail.materials.length ? (
              <ResponsiveTableShell className="max-w-full">
                <table className="min-w-[1040px] w-full border-collapse">
                  <thead className={skin.table.header}>
                    <tr>
                      <th className="px-3 py-2 text-left">素材</th>
                      <th className="px-3 py-2 text-left">角色 / 来源</th>
                      <th className="px-3 py-2 text-left">分类</th>
                      <th className="px-3 py-2 text-left">大小 / 时长</th>
                      <th className="px-3 py-2 text-left">拍摄人</th>
                      <th className="px-3 py-2 text-left">加入时间</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.materials.map((item, index) => (
                      <tr key={item.id} className={skin.table.row}>
                        <td className="px-3 py-2 align-top">
                          <Link href={`/admin/library?material=${encodeURIComponent(item.material.id)}`} className={cn("font-medium hover:text-primary", skin.typography.tableCell)}>
                            {item.material.storedFileName}
                          </Link>
                          <p className={skin.textDensity.id}>{item.material.materialId}</p>
                          <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>{item.material.originalFileName}</p>
                        </td>
                        <td className={cn("px-3 py-2 align-top", skin.typography.tableCell)}>
                          <p>{finishedWorkRoleLabel(item.role)}</p>
                          <p className={skin.typography.meta}>{item.sourcePackageId || "-"}</p>
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
                            <Button variant="ghost" size="sm" disabled={index === detail.materials.length - 1 || busy === "reorder"} onClick={() => reorder(item, 1)} aria-label="下移">
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
              <EmptyState title="成片内暂无素材" description="先关联一个精选包，再点击导入精选包素材建立真实使用记录。" />
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

function buildMetrics(works: FinishedWorkListItemDto[]) {
  return works.reduce((result, item) => ({
    total: result.total + 1,
    materialCount: result.materialCount + item.materialCount,
    totalSize: result.totalSize + item.totalSize
  }), { total: 0, materialCount: 0, totalSize: 0 });
}

function finishedWorkStatusTone(status: FinishedWorkStatus): SkinStatusTone {
  if (status === "PUBLISHED" || status === "DELIVERED") return "success";
  if (status === "IN_PROGRESS") return "processing";
  if (status === "ARCHIVED") return "neutral";
  return "review";
}

function finishedWorkStatusLabel(status: FinishedWorkStatus) {
  if (status === "DRAFT") return "草稿";
  if (status === "IN_PROGRESS") return "制作中";
  if (status === "DELIVERED") return "已交付";
  if (status === "PUBLISHED") return "已发布";
  return "已归档";
}

function finishedWorkRoleLabel(role: FinishedWorkRole) {
  if (role === "MAIN_CLIP") return "主素材";
  if (role === "B_ROLL") return "补充镜头";
  if (role === "COVER") return "封面";
  if (role === "AUDIO") return "音频";
  return "其他";
}

function toDateTimeLocalValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

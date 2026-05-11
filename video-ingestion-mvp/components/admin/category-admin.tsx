"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { ArchiveRestore, FolderTree, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CategoryDto = {
  id: string;
  code: string;
  name: string;
  assetType: string;
  parentId?: string | null;
  directoryName?: string | null;
  storagePath?: string | null;
  relativePath?: string | null;
  physicalDirectory?: string | null;
  level?: number | null;
  sortOrder: number;
  depth: number;
  status: "ACTIVE" | "DISABLED" | "DELETED";
  isSystem: boolean;
  allowUpload: boolean;
  notes?: string | null;
  materialCount?: number;
  canDelete?: boolean;
  canMove?: boolean;
};

type FormState = {
  name: string;
  folderName: string;
  parentId: string;
  sortOrder: string;
  allowUpload: boolean;
  status: "ACTIVE" | "DISABLED" | "DELETED";
  notes: string;
};

const OPERATOR = "本地管理员";

export function CategoryAdmin() {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [selectedRootId, setSelectedRootId] = useState("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selected, setSelected] = useState<CategoryDto | null>(null);
  const [mode, setMode] = useState<"edit" | "create">("edit");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm());

  const roots = useMemo(() => categories.filter((item) => !item.parentId), [categories]);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryDto[]>();
    for (const category of categories) {
      if (!category.parentId) continue;
      map.set(category.parentId, [...(map.get(category.parentId) || []), category]);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hans-CN"));
    return map;
  }, [categories]);
  const selectedRoot = roots.find((item) => item.id === selectedRootId) || roots[0];
  const firstLevel = selectedRoot ? childrenByParent.get(selectedRoot.id) || [] : [];
  const selectedParent = firstLevel.find((item) => item.id === selectedParentId) || firstLevel[0] || selectedRoot;
  const secondLevel = selectedParent ? childrenByParent.get(selectedParent.id) || [] : [];
  const movableParents = categories.filter((item) => item.status !== "DELETED" && item.depth < 3 && item.id !== selected?.id);

  async function refresh() {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    const data = await response.json();
    const nextCategories = data.categories || [];
    setCategories(nextCategories);
    const nextRoots = nextCategories.filter((item: CategoryDto) => !item.parentId);
    setSelectedRootId((current) => current || nextRoots[0]?.id || "");
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!selectedRootId && roots[0]) setSelectedRootId(roots[0].id);
  }, [roots, selectedRootId]);

  useEffect(() => {
    if (selectedRoot && !firstLevel.some((item) => item.id === selectedParentId)) {
      setSelectedParentId(firstLevel[0]?.id || selectedRoot.id);
    }
  }, [firstLevel, selectedParentId, selectedRoot]);

  function chooseRoot(root: CategoryDto) {
    setSelectedRootId(root.id);
    setSelectedParentId("");
    edit(root);
  }

  function chooseParent(category: CategoryDto) {
    setSelectedParentId(category.id);
    edit(category);
  }

  function edit(category: CategoryDto) {
    setMode("edit");
    setSelected(category);
    setForm({
      name: category.name,
      folderName: category.relativePath?.split("/").at(-1) || category.name,
      parentId: category.parentId || "",
      sortOrder: String(category.sortOrder),
      allowUpload: category.allowUpload,
      status: category.status,
      notes: category.notes || ""
    });
  }

  function createUnder(parent: CategoryDto) {
    setMode("create");
    setSelected(parent);
    setForm({
      ...emptyForm(),
      parentId: parent.id,
      sortOrder: String((childrenByParent.get(parent.id)?.length || 0) + 1)
    });
  }

  async function post(path: string, body: Record<string, unknown>, success: string) {
    setBusy(path);
    setMessage("");
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, operatorName: OPERATOR })
    });
    const data = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setMessage(data.error || "操作失败。");
      return;
    }
    setMessage(success);
    await refresh();
  }

  async function submit() {
    if (mode === "create") {
      await post("/api/admin/directories/create", {
        parentId: form.parentId,
        name: form.name,
        folderName: form.folderName || form.name,
        sortOrder: Number(form.sortOrder || 100),
        allowUpload: form.allowUpload,
        notes: form.notes
      }, "真实目录已创建。");
      return;
    }
    if (!selected) return;
    await post("/api/admin/directories/rename", {
      categoryId: selected.id,
      name: form.name,
      folderName: selected.parentId ? form.folderName : undefined,
      sortOrder: Number(form.sortOrder || 100),
      allowUpload: form.allowUpload,
      status: form.status,
      notes: form.notes
    }, "目录已保存并同步。");
  }

  async function moveSelected() {
    if (!selected || !form.parentId || selected.parentId === form.parentId) return;
    await post("/api/admin/directories/move", {
      categoryId: selected.id,
      targetParentId: form.parentId,
      notes: form.notes
    }, "目录已移动并同步。");
  }

  async function trashSelected() {
    if (!selected) return;
    await post("/api/admin/directories/trash", {
      categoryId: selected.id,
      notes: form.notes
    }, "目录已移动到目录回收站。");
  }

  async function restoreSelected() {
    if (!selected) return;
    await post("/api/admin/directories/restore", {
      categoryId: selected.id,
      targetParentId: form.parentId || undefined,
      notes: form.notes
    }, "目录已恢复。");
  }

  return (
    <div className="min-w-0 space-y-3 overflow-x-hidden xl:space-y-4" style={skin.vars}>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[220px_320px_minmax(0,1fr)] xl:gap-4">
        <Panel padding="none" className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-3 py-2.5 xl:px-4 xl:py-3">
            <div>
              <p className={cn("flex items-center gap-2", skin.typography.sectionTitle)}><FolderTree className="h-4 w-4" /> 根目录</p>
              <p className={cn("mt-1", skin.typography.meta)}>{roots.length} 个入口</p>
            </div>
            <Button variant="secondary" size="sm" className="h-10 w-10 shrink-0 px-0 xl:h-[var(--skin-control-height-sm)] xl:w-auto xl:px-2.5" onClick={refresh} aria-label="刷新根目录"><RefreshCcw className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="thin-scrollbar flex min-w-0 gap-2 overflow-x-auto overscroll-x-contain p-2 xl:block xl:space-y-2 xl:p-[var(--skin-panel-padding-compact)]">
            {roots.map((root) => (
              <RootTab key={root.id} category={root} active={selectedRoot?.id === root.id} onClick={() => chooseRoot(root)} />
            ))}
          </div>
        </Panel>

        <Panel padding="none" className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-3 py-2.5 xl:px-4 xl:py-3">
            <div className="min-w-0">
              <p className={skin.typography.sectionTitle}>{formatCategoryLabel(selectedRoot?.name) || "一级目录"}</p>
              <p className={cn("mt-1 truncate", skin.typography.meta)}>{selectedRoot?.relativePath || "选择根目录"} · {firstLevel.length} 个子目录</p>
            </div>
            {selectedRoot ? <Button size="sm" className="min-h-10 shrink-0" onClick={() => createUnder(selectedRoot)}><Plus className="mr-1 h-3.5 w-3.5" /> 新增到：{formatCategoryLabel(selectedRoot.name)}</Button> : null}
          </div>
          <div className="space-y-1.5 p-2 xl:space-y-2 xl:p-[var(--skin-panel-padding-compact)]">
            {firstLevel.length ? firstLevel.map((category) => (
              <CategoryRow key={category.id} category={category} active={selectedParent?.id === category.id} onClick={() => chooseParent(category)} />
            )) : (
              <Surface tone="muted" padding="sm" className={cn("text-muted-foreground", skin.typography.body)}>
                当前根目录下没有子目录。
              </Surface>
            )}
          </div>
        </Panel>

        <Panel padding="none" className="min-w-0 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-3 py-2.5 xl:px-4 xl:py-3">
            <div className="min-w-0">
              <p className={skin.typography.sectionTitle}>{mode === "create" ? "新增真实目录" : "目录详情"}</p>
              <p className={cn("mt-1 truncate", skin.typography.meta)}>{selectedParent?.relativePath || selected?.relativePath || "选择目录后编辑"}</p>
            </div>
            {selectedParent ? <Button variant="secondary" size="sm" className="min-h-10 shrink-0" onClick={() => createUnder(selectedParent)}><Plus className="mr-1 h-3.5 w-3.5" /> 新增到：{formatCategoryLabel(selectedParent.name)}</Button> : null}
          </div>
          <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-4 xl:p-[var(--skin-panel-padding)]">
            <div className="space-y-1.5 xl:space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className={skin.typography.sectionTitle}>{formatCategoryLabel(selectedParent?.name) || "当前目录"} / 子目录</p>
                <StatusPill tone="neutral">{secondLevel.length} 项</StatusPill>
              </div>
              {secondLevel.length ? secondLevel.map((category) => (
                <CategoryRow key={category.id} category={category} active={selected?.id === category.id} onClick={() => edit(category)} />
              )) : (
                <Surface tone="muted" padding="sm" className={cn("text-muted-foreground", skin.typography.body)}>
                  当前目录下没有子目录。
                </Surface>
              )}
            </div>

            <div className="space-y-3">
              <Field label="显示名称">
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="真实文件夹名">
                <Input value={form.folderName} onChange={(event) => setForm({ ...form, folderName: event.target.value })} disabled={Boolean(selected && !selected.parentId)} />
              </Field>
              <Field label="父级目录">
                <Select value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })} disabled={Boolean(selected && !selected.canMove)}>
                  <option value="">作为根目录</option>
                  {movableParents.map((item) => <option key={item.id} value={item.id}>{"　".repeat(Math.max(0, item.depth - 1))}{item.name}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="排序">
                  <Input value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
                </Field>
                <Field label="状态">
                  <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as FormState["status"] })}>
                    <option value="ACTIVE">启用</option>
                    <option value="DISABLED">停用</option>
                    <option value="DELETED">目录回收站</option>
                  </Select>
                </Field>
              </div>
              <label className={cn("flex items-center gap-2", skin.typography.body)}>
                <input type="checkbox" checked={form.allowUpload} disabled={Boolean(selected && !selected.parentId)} onChange={(event) => setForm({ ...form, allowUpload: event.target.checked })} />
                允许上传选择
              </label>
              <Field label="备注">
                <Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </Field>
              {selected ? (
                <Surface tone="muted" padding="sm" className={cn("space-y-1", skin.typography.technical)}>
                  <p>真实路径：{selected.relativePath || "-"}</p>
                  <p>目录标识：{selected.directoryName || "-"}</p>
                  <p>存储路径：{selected.storagePath || "-"}</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <StatusPill tone="neutral">素材 {selected.materialCount ?? 0}</StatusPill>
                    <StatusPill tone="info">层级 {selected.level ?? selected.depth} / 3</StatusPill>
                    {selected.isSystem ? <StatusPill tone="review">系统目录</StatusPill> : null}
                  </div>
                </Surface>
              ) : null}
              {message ? (
                <Surface tone="muted" padding="sm" className={cn("font-medium", skin.typography.body)}>
                  <StatusPill tone={message.includes("失败") ? "danger" : "info"}>{message}</StatusPill>
                </Surface>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={submit} disabled={Boolean(busy)}><Save className="mr-2 h-4 w-4" /> {mode === "create" ? "创建真实目录" : "保存并同步"}</Button>
                {selected?.canMove && selected.parentId !== form.parentId ? <Button variant="secondary" onClick={moveSelected}>移动目录</Button> : null}
                {selected?.status === "DELETED" ? <Button variant="secondary" onClick={restoreSelected}><ArchiveRestore className="mr-1 h-3.5 w-3.5" /> 恢复</Button> : null}
                {selected?.canDelete ? <Button variant="destructive" onClick={trashSelected}><Trash2 className="mr-1 h-3.5 w-3.5" /> 删除到目录回收站</Button> : null}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RootTab({ category, active, onClick }: { category: CategoryDto; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[var(--skin-category-root-tab-min-height)] shrink-0 items-center gap-2 rounded-[var(--skin-radius-full)] border px-3 text-left transition xl:min-h-0 xl:w-full xl:shrink xl:flex-col xl:items-stretch xl:gap-0 xl:rounded-[var(--skin-radius-control)] xl:p-3",
        skin.typography.bodyDense,
        skin.listItem,
        active ? "border-primary bg-[color:var(--skin-surface-selected)] shadow-[var(--skin-shadow-card)] ring-1 ring-primary/20" : ""
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate font-semibold">{formatCategoryLabel(category.name)}</span>
        <StatusPill tone="neutral">{category.materialCount ?? 0}</StatusPill>
      </div>
      <p className={cn("mt-1 hidden truncate xl:block", skin.typography.meta)}>{category.relativePath}</p>
      <div className="mt-2 hidden flex-wrap gap-1 xl:flex">
        <Badge tone="info">{category.depth} 层</Badge>
        {category.allowUpload ? <Badge tone="success">可上传</Badge> : <Badge>分组</Badge>}
        <Badge tone={categoryStatusTone(category.status)}>{categoryStatusLabel(category.status)}</Badge>
      </div>
    </button>
  );
}

function CategoryRow({ category, active, onClick }: { category: CategoryDto; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid min-h-[var(--skin-category-mobile-row-min-height)] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-2.5 text-left xl:block xl:p-3",
        skin.typography.bodyDense,
        skin.listItem,
        active ? "border-primary bg-[color:var(--skin-surface-selected)] shadow-[var(--skin-shadow-card)] ring-1 ring-primary/20" : ""
      )}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 xl:justify-between">
          <span className="min-w-0 truncate font-semibold">{formatCategoryLabel(category.name)}</span>
          <StatusPill tone="neutral" className="hidden xl:inline-flex">{category.materialCount ?? 0}</StatusPill>
        </div>
        <p className={cn("mt-1 line-clamp-2 break-all xl:truncate", skin.typography.path)}>{category.relativePath}</p>
        <div className="mt-1.5 flex flex-wrap gap-1 xl:mt-2">
          {category.allowUpload ? <Badge tone="success">可上传</Badge> : <Badge>分组</Badge>}
          <Badge tone={categoryStatusTone(category.status)}>{categoryStatusLabel(category.status)}</Badge>
          <Badge tone="info" className="hidden xl:inline-flex">{category.depth} 层</Badge>
        </div>
      </div>
      <StatusPill tone="neutral" className="justify-self-end xl:hidden">{category.materialCount ?? 0}</StatusPill>
    </button>
  );
}

function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: SkinStatusTone; className?: string }) {
  return <StatusPill tone={tone} className={cn("px-1.5 py-0", className)}>{children}</StatusPill>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={cn("space-y-1.5 font-medium", skin.typography.body)}>
      {label}
      {children}
    </label>
  );
}

function categoryStatusTone(status: CategoryDto["status"]): SkinStatusTone {
  if (status === "ACTIVE") return "success";
  if (status === "DISABLED") return "warning";
  return "neutral";
}

function categoryStatusLabel(status: CategoryDto["status"]) {
  if (status === "ACTIVE") return "启用";
  if (status === "DISABLED") return "停用";
  return "回收站";
}

function formatCategoryLabel(value?: string | null) {
  return (value || "").trim().replace(/^\d+[_-]/, "");
}

function emptyForm(): FormState {
  return {
    name: "",
    folderName: "",
    parentId: "",
    sortOrder: "100",
    allowUpload: true,
    status: "ACTIVE",
    notes: ""
  };
}

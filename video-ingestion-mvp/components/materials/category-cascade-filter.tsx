"use client";

import { ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type CategoryNodeDto = {
  id: string;
  name: string;
  assetType: string;
  parentId?: string | null;
  relativePath?: string | null;
  status: "ACTIVE" | "DISABLED" | "DELETED";
  allowUpload: boolean;
  depth: number;
  sortOrder: number;
  materialCount?: number;
};

export function CategoryCascadeFilter({
  categories,
  selectedPath,
  search,
  onSearchChange,
  onSelectPath,
  onClear
}: {
  categories: CategoryNodeDto[];
  selectedPath: CategoryNodeDto[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPath: (path: CategoryNodeDto[]) => void;
  onClear: () => void;
}) {
  const childrenByParent = buildChildrenByParent(categories);
  const roots = childrenByParent.get("ROOT") || [];
  const currentParent = selectedPath.at(-1);
  const nextChildren = childrenByParent.get(currentParent?.id || "ROOT") || [];
  const searchable = search.trim()
    ? categories.filter((item) => `${item.name} ${item.relativePath || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    : [];

  function selectCategory(category: CategoryNodeDto) {
    const parentIndex = selectedPath.findIndex((item) => item.id === category.parentId);
    if (!category.parentId) {
      onSelectPath([category]);
      return;
    }
    if (parentIndex >= 0) {
      onSelectPath([...selectedPath.slice(0, parentIndex + 1), category]);
      return;
    }
    onSelectPath(buildPath(category, categories));
  }

  return (
    <div className="space-y-3 rounded-xl border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {selectedPath.length ? (
          selectedPath.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2">
              {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
              <button
                type="button"
                className="rounded-full border bg-slate-50 px-3 py-1 text-sm font-medium hover:border-primary"
                onClick={() => onSelectPath(selectedPath.slice(0, index + 1))}
              >
                {item.name}
                {item.status !== "ACTIVE" ? <span className="ml-1 text-xs text-orange-600">已停用</span> : null}
              </button>
            </div>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">全部目录</span>
        )}
        {selectedPath.length ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="mr-1 h-3.5 w-3.5" /> 清除目录
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 lg:grid-cols-[minmax(180px,260px)_minmax(180px,280px)_1fr]">
        <Select value="" onChange={(event) => {
          const root = roots.find((item) => item.id === event.target.value);
          if (root) onSelectPath([root]);
        }}>
          <option value="">选择素材大类</option>
          {roots.map((root) => <option key={root.id} value={root.id}>{root.name}</option>)}
        </Select>

        <Select value="" onChange={(event) => {
          const child = nextChildren.find((item) => item.id === event.target.value);
          if (child) selectCategory(child);
        }}>
          <option value="">{currentParent ? "继续选择子目录" : "先选择大类"}</option>
          {nextChildren.map((child) => (
            <option key={child.id} value={child.id}>
              {child.name}{child.status !== "ACTIVE" ? "（已停用）" : ""} · {child.materialCount ?? 0}
            </option>
          ))}
        </Select>

        <div className="relative">
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索目录名称或路径" />
          {searchable.length ? (
            <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border bg-white shadow-lg">
              {searchable.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    onSearchChange("");
                    onSelectPath(buildPath(item, categories));
                  }}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{item.relativePath}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildChildrenByParent(categories: CategoryNodeDto[]) {
  const map = new Map<string, CategoryNodeDto[]>();
  for (const category of categories) {
    const key = category.parentId || "ROOT";
    map.set(key, [...(map.get(key) || []), category]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-Hans-CN"));
  }
  return map;
}

function buildPath(category: CategoryNodeDto, categories: CategoryNodeDto[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const path: CategoryNodeDto[] = [];
  let current: CategoryNodeDto | undefined = category;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

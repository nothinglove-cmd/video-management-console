"use client";

import { useEffect, useMemo, useState } from "react";

import type { CategoryNodeDto } from "@/components/materials/category-cascade-filter";
import type { MaterialDto } from "@/components/materials/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ROOT_CATEGORY_OPTIONS,
  SUB_CATEGORY_OPTIONS,
  type UploadRootCategory
} from "@/lib/storage/storage.constants";

type DialogProps = {
  material: MaterialDto;
  onClose: () => void;
};

type RenameDialogProps = DialogProps & {
  onSubmit: (fileName: string) => void;
};

type MoveDialogProps = DialogProps & {
  title?: string;
  submitLabel?: string;
  initialRootCategory?: UploadRootCategory;
  initialSubCategory?: string;
  categories?: CategoryNodeDto[];
  onSubmit: (rootCategory: UploadRootCategory, subCategory: string, directory: string, category?: CategoryNodeDto) => void;
};

type TagsDialogProps = DialogProps & {
  onSubmit: (payload: {
    humanTags: string[];
    subject?: string | null;
    scene?: string | null;
    action?: string | null;
    usage?: string | null;
    notes?: string | null;
  }) => void;
};

type ConfirmDialogProps = DialogProps & {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
};

export function RenameMaterialDialog({ material, onClose, onSubmit }: RenameDialogProps) {
  const [fileName, setFileName] = useState(material.storedFileName);
  const finalName = useMemo(() => ensureMaterialId(material.materialId, fileName), [fileName, material.materialId]);

  return (
    <DialogFrame title="改名" onClose={onClose}>
      <div className="space-y-4">
        <Info label="素材 ID" value={`${material.materialId}（系统会自动保留在文件名前）`} />
        <label className="space-y-1.5 text-sm font-medium">
          新文件名
          <Input value={fileName} onChange={(event) => setFileName(event.target.value)} />
        </label>
        <Info label="最终文件名预览" value={finalName} />
        <DialogActions onClose={onClose} onSubmit={() => onSubmit(finalName)} submitLabel="保存改名" />
      </div>
    </DialogFrame>
  );
}

export function MoveMaterialDialog({
  material,
  title = "移动分类",
  submitLabel = "移动到此目录",
  initialRootCategory,
  initialSubCategory,
  categories,
  onClose,
  onSubmit
}: MoveDialogProps) {
  const fallbackRoot = getRootForAssetType(material.assetType);
  const [rootCategory, setRootCategory] = useState<UploadRootCategory>(initialRootCategory || fallbackRoot);
  const [subCategory, setSubCategory] = useState(initialSubCategory || SUB_CATEGORY_OPTIONS[initialRootCategory || fallbackRoot][0]?.value || "");
  const [selectedCategoryId, setSelectedCategoryId] = useState(material.finalCategoryId || material.categoryId || "");
  const options = SUB_CATEGORY_OPTIONS[rootCategory] || [];
  const directory = options.find((item) => item.value === subCategory)?.directory || options[0]?.directory || "";
  const selectableCategories = useMemo(() => getSelectableLeafCategories(categories || []), [categories]);
  const selectedCategory = selectableCategories.find((category) => category.id === selectedCategoryId);
  const useDynamicCategories = Boolean(categories?.length);

  useEffect(() => {
    const nextOptions = SUB_CATEGORY_OPTIONS[rootCategory] || [];
    if (!nextOptions.some((item) => item.value === subCategory)) {
      setSubCategory(nextOptions[0]?.value || "");
    }
  }, [rootCategory, subCategory]);

  useEffect(() => {
    if (!useDynamicCategories) return;
    if (selectedCategoryId && selectableCategories.some((category) => category.id === selectedCategoryId)) return;
    setSelectedCategoryId(selectableCategories[0]?.id || "");
  }, [selectableCategories, selectedCategoryId, useDynamicCategories]);

  return (
    <DialogFrame title={title} onClose={onClose}>
      <div className="space-y-4">
        <Info label="当前文件" value={material.storedFileName} />
        <Info label="当前目录" value={material.primaryCategory} />
        {useDynamicCategories ? (
          <>
            <label className="space-y-1.5 text-sm font-medium">
              目标栏目
              <Select value={selectedCategoryId} onChange={(event) => setSelectedCategoryId(event.target.value)}>
                {selectableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {formatCategoryOption(category, categories || [])}
                  </option>
                ))}
              </Select>
            </label>
            <Info label="目标目录" value={selectedCategory?.relativePath || "没有可移动的有效叶子栏目"} />
          </>
        ) : (
          <>
            <label className="space-y-1.5 text-sm font-medium">
              素材大类
              <Select value={rootCategory} onChange={(event) => setRootCategory(event.target.value as UploadRootCategory)}>
                {ROOT_CATEGORY_OPTIONS.filter((item) => item.value !== "AUTO").map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              二级目录
              <Select value={subCategory} onChange={(event) => setSubCategory(event.target.value)}>
                {options.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </Select>
            </label>
            <Info label="目标目录" value={directory || "-"} />
          </>
        )}
        <DialogActions
          onClose={onClose}
          onSubmit={() => {
            if (selectedCategory) {
              onSubmit(selectedCategory.assetType as UploadRootCategory, selectedCategory.name, selectedCategory.relativePath || "", selectedCategory);
              return;
            }
            onSubmit(rootCategory, subCategory, directory);
          }}
          submitLabel={submitLabel}
          disabled={useDynamicCategories ? !selectedCategory?.relativePath : !directory}
        />
      </div>
    </DialogFrame>
  );
}

export function EditTagsDialog({ material, onClose, onSubmit }: TagsDialogProps) {
  const [tags, setTags] = useState(tagsToText(material.humanTags));
  const [subject, setSubject] = useState(material.subject || "");
  const [scene, setScene] = useState(material.scene || "");
  const [action, setAction] = useState(material.action || "");
  const [usage, setUsage] = useState(material.usage || "");
  const [notes, setNotes] = useState(material.notes || "");

  return (
    <DialogFrame title="编辑标签" onClose={onClose}>
      <div className="grid gap-3">
        <Info label="当前文件" value={material.storedFileName} />
        <label className="space-y-1.5 text-sm font-medium">
          人工标签
          <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="逗号分隔，例如 老虎,开头钩子,视觉冲击" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">主体<Input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium">场景<Input value={scene} onChange={(event) => setScene(event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium">动作<Input value={action} onChange={(event) => setAction(event.target.value)} /></label>
          <label className="space-y-1.5 text-sm font-medium">用途<Input value={usage} onChange={(event) => setUsage(event.target.value)} /></label>
        </div>
        <label className="space-y-1.5 text-sm font-medium">
          备注
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <DialogActions
          onClose={onClose}
          submitLabel="保存标签并确认"
          onSubmit={() => onSubmit({
            humanTags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean),
            subject,
            scene,
            action,
            usage,
            notes
          })}
        />
      </div>
    </DialogFrame>
  );
}

export function ConfirmMaterialDialog({
  material,
  title,
  description,
  confirmLabel,
  tone = "default",
  onClose,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <DialogFrame title={title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Info label="文件名" value={material.storedFileName} />
        <Info label="当前位置" value={material.relativePath} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant={tone === "danger" ? "destructive" : "default"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </DialogFrame>
  );
}

function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="w-full max-w-xl rounded-2xl border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function DialogActions({ onClose, onSubmit, submitLabel, disabled }: { onClose: () => void; onSubmit: () => void; submitLabel: string; disabled?: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="secondary" onClick={onClose}>取消</Button>
      <Button onClick={onSubmit} disabled={disabled}>{submitLabel}</Button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-sm font-medium">{value}</p>
    </div>
  );
}

function tagsToText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return Object.values(value).flat().join(", ");
  return "";
}

function ensureMaterialId(materialId: string, fileName: string) {
  const trimmed = fileName.trim();
  if (!trimmed) return `${materialId}_待整理`;
  return trimmed.startsWith(materialId) ? trimmed : `${materialId}_${trimmed}`;
}

function getRootForAssetType(assetType: MaterialDto["assetType"]): UploadRootCategory {
  if (assetType === "PRODUCT_MATERIAL") return "PRODUCT_MATERIAL";
  if (assetType === "REFERENCE_VIDEO") return "REFERENCE_VIDEO";
  if (assetType === "PUBLIC_RESOURCE") return "PUBLIC_RESOURCE";
  return "ACCOUNT_MATERIAL";
}

function getSelectableLeafCategories(categories: CategoryNodeDto[]) {
  const parentIds = new Set(categories.map((category) => category.parentId).filter(Boolean));
  return categories
    .filter((category) => category.status === "ACTIVE")
    .filter((category) => category.allowUpload)
    .filter((category) => Boolean(category.relativePath))
    .filter((category) => !parentIds.has(category.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.relativePath || a.name).localeCompare(b.relativePath || b.name, "zh-Hans-CN"));
}

function formatCategoryOption(category: CategoryNodeDto, categories: CategoryNodeDto[]) {
  return buildCategoryPath(category, categories).map((item) => item.name).join(" / ") || category.name;
}

function buildCategoryPath(category: CategoryNodeDto, categories: CategoryNodeDto[]) {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const path: CategoryNodeDto[] = [];
  let current: CategoryNodeDto | undefined = category;
  while (current) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

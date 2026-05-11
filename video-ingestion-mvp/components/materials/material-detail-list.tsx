"use client";

import { RotateCcw } from "lucide-react";

import { ActionToolbar, type MaterialActions } from "@/components/materials/action-toolbar";
import { ConfidenceBadge } from "@/components/materials/confidence-badge";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import { MaterialIssueBadges } from "@/components/materials/material-issue-badges";
import { StatusBadge } from "@/components/materials/status-badge";
import type { MaterialDto } from "@/components/materials/types";
import { Button } from "@/components/ui/button";
import { toLocalDateTime } from "@/lib/utils";

export function MaterialDetailList({
  materials,
  selectedIds,
  onSelect,
  onOpen,
  actions,
  trash = false,
  onRestore
}: {
  materials: MaterialDto[];
  selectedIds: string[];
  onSelect: (materialId: string, checked: boolean) => void;
  onOpen: (material: MaterialDto) => void;
  actions: MaterialActions;
  trash?: boolean;
  onRestore?: (material: MaterialDto) => void;
}) {
  return (
    <div className="space-y-3">
      {materials.map((material) => (
        <article key={material.id} className="grid gap-3 rounded-xl border bg-white p-3 shadow-sm lg:grid-cols-[180px_1fr_auto]">
          <button
            type="button"
            className="relative overflow-hidden rounded-lg bg-slate-100"
            style={{
              aspectRatio: getMaterialAspectRatio(material),
              maxHeight: isVerticalMaterial(material) ? 260 : 180
            }}
            onClick={() => onOpen(material)}
          >
            {material.thumbnailPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-full w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
            ) : (
              <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">暂无缩略图</div>
            )}
          </button>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="h-4 w-4 rounded"
                type="checkbox"
                checked={selectedIds.includes(material.id)}
                onChange={(event) => onSelect(material.id, event.target.checked)}
              />
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onOpen(material)}>
                {material.materialId}
              </button>
              <StatusBadge status={material.status} />
              <ConfidenceBadge value={material.aiConfidence} />
              <MaterialIssueBadges material={material} />
            </div>
            <button type="button" className="line-clamp-2 text-left text-base font-semibold hover:text-primary" onClick={() => onOpen(material)}>
              {material.storedFileName}
            </button>
            <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
              <p className="truncate">目录：{material.primaryCategory || "-"}</p>
              <p className="truncate">拍摄人：{material.shooterName || material.uploaderName || "-"}</p>
              <p className="truncate">索引：{[material.subjectType, material.subject, material.scene, material.action, material.usage].filter(Boolean).join(" · ") || "-"}</p>
              <p className="truncate">上传时间：{toLocalDateTime(material.createdAt)}</p>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{material.aiSummary || "暂无 AI 摘要"}</p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ...toStringTags(material.aiEmotionTags),
                ...toStringTags(material.aiUsageTags),
                ...toStringTags(material.customTags)
              ].slice(0, 10).map((tag) => (
                <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tag}</span>
              ))}
            </div>
          </div>
          <div className="flex items-start justify-end lg:min-w-36">
            {trash ? (
              <Button variant="secondary" size="sm" onClick={() => onRestore?.(material)}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" /> 恢复
              </Button>
            ) : (
              <ActionToolbar material={material} actions={actions} compact />
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function toStringTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

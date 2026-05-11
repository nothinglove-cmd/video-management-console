"use client";

import { MoreHorizontal } from "lucide-react";

import { ConfidenceBadge } from "@/components/materials/confidence-badge";
import { MaterialIssueBadges } from "@/components/materials/material-issue-badges";
import { StatusBadge } from "@/components/materials/status-badge";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import type { MaterialDto } from "@/components/materials/types";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { fileTypeFromMime } from "@/components/ui/file-type-icon";
import { MediaPlaceholder } from "@/components/ui/media-placeholder";
import { cn, toLocalDateTime } from "@/lib/utils";

export type MaterialCardSize = "small" | "medium" | "large";

export function MaterialCard({
  material,
  selected,
  size = "medium",
  onSelect,
  onOpen,
  children
}: {
  material: MaterialDto;
  selected?: boolean;
  size?: MaterialCardSize;
  onSelect?: (checked: boolean) => void;
  onOpen?: () => void;
  children?: React.ReactNode;
}) {
  const vertical = isVerticalMaterial(material);
  const compact = size === "small";
  const imageMaxHeight = size === "large" ? "max-h-[680px]" : size === "small" ? "max-h-[260px]" : "max-h-[420px]";

  return (
    <div className={cn("group min-w-0 overflow-hidden rounded-[var(--skin-radius-card)] border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] shadow-[var(--skin-shadow-card)] transition hover:border-primary/30 hover:shadow-[var(--skin-shadow-panel)]", selected && "border-primary ring-1 ring-primary")}>
      <button
        type="button"
        className={cn(
          "relative mx-auto block w-full overflow-hidden text-left",
          skin.media.thumbnail,
          vertical && imageMaxHeight,
          vertical && "bg-[color:var(--skin-media-thumbnail-bg)]"
        )}
        style={{ aspectRatio: getMaterialAspectRatio(material) }}
        onClick={onOpen}
      >
        {material.thumbnailPath ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="h-full w-full object-contain transition group-hover:scale-[1.01]" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
        ) : (
          <MediaPlaceholder type={fileTypeFromMime(material.mimeType)} size={size === "large" ? "lg" : compact ? "sm" : "md"} />
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1">
          {onSelect ? (
            <input
              className="h-5 w-5 rounded border-white"
              type="checkbox"
              checked={selected}
              onChange={(event) => {
                event.stopPropagation();
                onSelect(event.target.checked);
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : null}
        </div>
        <div className={cn("absolute bottom-2 left-2 rounded bg-black/65 px-1.5 py-0.5 font-medium text-white", skin.typography.badge)}>
          {material.duration ? `${Math.floor(material.duration / 60)}:${String(Math.round(material.duration % 60)).padStart(2, "0")}` : "预览"}
        </div>
      </button>
      <div className={cn("space-y-2", compact ? "p-2" : "p-3")}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={skin.textDensity.id}>{material.materialId}</p>
            <button type="button" className={cn("mt-0.5 min-w-0 break-words text-left hover:text-primary", skin.textDensity.cardFileName, "line-clamp-2")} onClick={onOpen}>
              {material.storedFileName}
            </button>
          </div>
          <Button variant="ghost" size="sm" onClick={onOpen}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
        <p className={cn("truncate", skin.textDensity.technical)}>{material.primaryCategory}</p>
        {!compact ? (
          <p className={cn("truncate", skin.textDensity.technical)}>
            {[material.subjectType, material.subject, material.contentIntent, material.topicName || material.topicSuggestion].filter(Boolean).join(" · ") || "未生成索引"}
          </p>
        ) : null}
        <MaterialIssueBadges material={material} limit={compact ? 2 : 3} />
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={material.status} />
          <ConfidenceBadge value={material.aiConfidence} />
        </div>
        <div className={cn("items-center justify-between", skin.textDensity.technical, compact ? "hidden" : "flex")}>
          <span>{material.shooterName || material.uploaderName || "未填写"}</span>
          <span>{toLocalDateTime(material.createdAt)}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

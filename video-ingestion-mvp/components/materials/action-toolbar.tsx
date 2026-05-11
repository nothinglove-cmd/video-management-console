"use client";

import { CheckCircle2, Download, FilePenLine, FolderInput, PackagePlus, RefreshCcw, RotateCcw, Tags, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MaterialDto } from "@/components/materials/types";
import { cn } from "@/lib/utils";

export type MaterialActions = {
  rename?: (material: MaterialDto) => void;
  move?: (material: MaterialDto) => void;
  editTags?: (material: MaterialDto) => void;
  trash?: (material: MaterialDto) => void;
  reanalyze?: (material: MaterialDto) => void;
  applyAiSuggestion?: (material: MaterialDto) => void;
  confirm?: (material: MaterialDto) => void;
  useUserSelection?: (material: MaterialDto) => void;
  resolveConflictManually?: (material: MaterialDto) => void;
  addToPackage?: (material: MaterialDto) => void;
  restore?: (material: MaterialDto) => void;
};

export function ActionToolbar({
  material,
  actions,
  compact = false,
  layout = "default"
}: {
  material: MaterialDto;
  actions: MaterialActions;
  compact?: boolean;
  layout?: "default" | "drawer";
}) {
  const isDrawer = layout === "drawer";
  const actionButtonClassName = isDrawer ? "min-h-[var(--skin-touch-target-min-height)] flex-1 px-2 sm:flex-none sm:min-h-0" : undefined;
  const secondaryButtonClassName = isDrawer ? "min-h-[var(--skin-touch-target-min-height)] flex-1 px-2 sm:flex-none sm:min-h-0" : undefined;
  const destructiveButtonClassName = isDrawer ? "min-h-[var(--skin-touch-target-min-height)] flex-1 px-2 sm:flex-none sm:min-h-0" : undefined;

  return (
    <div className={cn("flex flex-wrap gap-1.5", isDrawer && "gap-2 sm:gap-1.5")}>
      <div className={cn("flex flex-wrap gap-1.5", isDrawer && "w-full gap-2 sm:w-auto sm:gap-1.5")}>
        {actions.rename ? (
          <Button variant="secondary" size="sm" className={actionButtonClassName} onClick={() => actions.rename?.(material)}>
            <FilePenLine className="mr-1 h-3.5 w-3.5" /> {compact ? "改名" : "改名"}
          </Button>
        ) : null}
        {actions.move ? (
          <Button variant="secondary" size="sm" className={actionButtonClassName} onClick={() => actions.move?.(material)}>
            <FolderInput className="mr-1 h-3.5 w-3.5" /> 分类
          </Button>
        ) : null}
        {actions.editTags ? (
          <Button variant="secondary" size="sm" className={actionButtonClassName} onClick={() => actions.editTags?.(material)}>
            <Tags className="mr-1 h-3.5 w-3.5" /> 标签
          </Button>
        ) : null}
        {actions.reanalyze ? (
          <Button variant="secondary" size="sm" className={actionButtonClassName} onClick={() => actions.reanalyze?.(material)}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> AI
          </Button>
        ) : null}
        {actions.applyAiSuggestion ? (
          <Button variant="default" size="sm" className={actionButtonClassName} onClick={() => actions.applyAiSuggestion?.(material)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 应用建议
          </Button>
        ) : null}
      </div>

      <div className={cn("flex flex-wrap gap-1.5", isDrawer && "w-full gap-2 border-t border-[color:var(--skin-border-subtle)] pt-2 sm:w-auto sm:border-t-0 sm:pt-0 sm:gap-1.5")}>
        {actions.confirm && material.status !== "READY" && material.status !== "IMPORTED" ? (
          <Button variant="default" size="sm" className={secondaryButtonClassName} onClick={() => actions.confirm?.(material)}>
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> 确认入库
          </Button>
        ) : null}
        {material.classificationConflict && actions.useUserSelection ? (
          <Button variant="secondary" size="sm" className={secondaryButtonClassName} onClick={() => actions.useUserSelection?.(material)}>
            采用人工
          </Button>
        ) : null}
        {material.classificationConflict && actions.resolveConflictManually ? (
          <Button variant="secondary" size="sm" className={secondaryButtonClassName} onClick={() => actions.resolveConflictManually?.(material)}>
            手动目录
          </Button>
        ) : null}
        {actions.addToPackage ? (
          <Button variant="secondary" size="sm" className={secondaryButtonClassName} onClick={() => actions.addToPackage?.(material)}>
            <PackagePlus className="mr-1 h-3.5 w-3.5" /> 精选包
          </Button>
        ) : null}
        {actions.restore ? (
          <Button variant="secondary" size="sm" className={secondaryButtonClassName} onClick={() => actions.restore?.(material)}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> 恢复
          </Button>
        ) : null}
        <Button asChild variant="secondary" size="sm" className={secondaryButtonClassName}>
          <a href={`/api/materials/${material.id}/download`}>
            <Download className="mr-1 h-3.5 w-3.5" /> 下载
          </a>
        </Button>
        {actions.trash ? (
          <Button variant="destructive" size="sm" className={destructiveButtonClassName} onClick={() => actions.trash?.(material)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除
          </Button>
        ) : null}
      </div>
    </div>
  );
}

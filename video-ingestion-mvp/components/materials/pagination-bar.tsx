"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export type PaginationDto = {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const PAGE_SIZE_OPTIONS = [24, 48, 96, 144];

export function PaginationBar({
  pagination,
  onPageChange,
  onPageSizeChange
}: {
  pagination: PaginationDto;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, pagination.pageCount || 1);
  const page = Math.min(pageCount, Math.max(1, pagination.page || 1));
  const start = pagination.total === 0 ? 0 : (page - 1) * pagination.pageSize + 1;
  const end = Math.min(pagination.total, page * pagination.pageSize);

  return (
    <div className={`${skin.panel} flex flex-col gap-3 px-3 py-3 text-sm md:flex-row md:items-center md:justify-between`}>
      <div className="text-muted-foreground">
        显示 <span className="font-semibold text-foreground">{start}</span> -{" "}
        <span className="font-semibold text-foreground">{end}</span> 条，共{" "}
        <span className="font-semibold text-foreground">{pagination.total}</span> 条
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">每页</span>
        <Select
          className="h-[var(--skin-touch-target-min-height)] w-24"
          value={String(pagination.pageSize)}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </Select>
        <Button className="h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(1)}>
          首页
        </Button>
        <Button className="h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-20 text-center font-medium">
          {page} / {pageCount}
        </span>
        <Button className="h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button className="h-[var(--skin-touch-target-min-height)] flex-1 sm:flex-none" variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(pageCount)}>
          末页
        </Button>
      </div>
    </div>
  );
}

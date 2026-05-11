"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ThumbnailSize = "small" | "medium" | "large";

const OPTIONS: Array<{ value: ThumbnailSize; label: string }> = [
  { value: "small", label: "小缩略图" },
  { value: "medium", label: "中缩略图" },
  { value: "large", label: "大缩略图" }
];

export function ThumbnailSizeControl({
  value,
  onChange
}: {
  value: ThumbnailSize;
  onChange: (value: ThumbnailSize) => void;
}) {
  return (
    <div className="flex w-full min-w-0 rounded-lg border bg-white p-1 sm:w-auto">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          className={cn("min-w-0 flex-1 px-2 sm:flex-none", option.value === "medium" && "px-1.5 sm:px-2.5")}
          variant={value === option.value ? "default" : "ghost"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

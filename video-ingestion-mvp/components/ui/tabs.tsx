import * as React from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export type TabItem<T extends string> = {
  value: T;
  label: string;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("thin-scrollbar flex gap-1 overflow-x-auto rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border)] bg-[color:var(--skin-muted-bg)] p-1", className)}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className={cn(
            "min-h-[var(--skin-control-height-sm)] shrink-0 rounded-[var(--skin-radius-sm)] px-3 font-semibold transition",
            skin.typography.badge,
            value === item.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:bg-[color:var(--skin-surface-hover)] hover:text-foreground"
          )}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact = false,
  className
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(compact ? skin.emptyStateCompact : skin.emptyState, className)}>
      {Icon ? (
        <div className={cn("flex items-center justify-center rounded-[var(--skin-radius-panel)] bg-[color:var(--skin-surface-selected)] text-primary", compact ? "h-9 w-9" : "h-12 w-12")}>
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
      ) : null}
      <p className={cn("font-semibold text-foreground", compact ? "mt-3" : "mt-4", compact ? skin.typography.value : skin.typography.sectionTitle)}>{title}</p>
      {description ? <div className={cn("mx-auto mt-2 max-w-xl", compact ? skin.typography.meta : skin.typography.body)}>{description}</div> : null}
      {action ? <div className={cn("flex flex-wrap justify-center gap-2", compact ? "mt-3" : "mt-4")}>{action}</div> : null}
    </div>
  );
}

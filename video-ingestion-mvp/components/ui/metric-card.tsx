import type { LucideIcon } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "neutral",
  className
}: {
  label: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  tone?: SkinStatusTone;
  className?: string;
}) {
  const status = skin.status[tone];

  return (
    <div className={cn(skin.metric.base, className)}>
      <div className="flex items-start gap-3">
        <div className={cn(skin.metric.icon, status.background, status.text)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={skin.metric.label}>{label}</p>
          <p className={cn("mt-1", skin.metric.value)}>{value}</p>
          {description ? <p className={cn("mt-2", skin.metric.description)}>{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

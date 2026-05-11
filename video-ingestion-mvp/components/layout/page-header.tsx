import type { ReactNode } from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between lg:mb-5", skin.sectionHeader)}>
      <div className="min-w-0">
        {eyebrow ? <p className={cn("font-semibold uppercase tracking-normal text-primary", skin.typography.meta)}>{eyebrow}</p> : null}
        <h1 className={cn("mt-0.5 truncate", skin.typography.pageTitle)}>{title}</h1>
        {description ? <p className={cn("mt-1 max-w-3xl", skin.typography.pageDescription)}>{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

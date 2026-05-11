import type { HTMLAttributes } from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function ResponsiveTableShell({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(skin.table.wrapper, "max-w-full", className)} {...props} />;
}

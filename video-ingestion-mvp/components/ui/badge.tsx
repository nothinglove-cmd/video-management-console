import * as React from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border bg-white px-2 py-0.5 font-medium text-muted-foreground",
        skin.typography.badge,
        className
      )}
      {...props}
    />
  );
}

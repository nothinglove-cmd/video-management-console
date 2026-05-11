import * as React from "react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SkinStatusTone;
  withDot?: boolean;
}

export function StatusPill({
  className,
  tone = "neutral",
  withDot = false,
  children,
  ...props
}: StatusPillProps) {
  const status = skin.status[tone];

  return (
    <span className={cn(status.pill, className)} {...props}>
      {withDot ? <span className={status.dot} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

import * as React from "react";

import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

type SurfaceTone = "panel" | "muted" | "raised" | "toolbar" | "plain";
type SurfacePadding = "none" | "sm" | "md" | "lg";

const toneClass: Record<SurfaceTone, string> = {
  panel: skin.panel,
  muted: skin.mutedPanel,
  raised: skin.raisedPanel,
  toolbar: skin.toolbar,
  plain: "rounded-[var(--skin-radius-panel)]"
};

const paddingClass: Record<SurfacePadding, string> = {
  none: "",
  sm: "p-[var(--skin-panel-padding-compact)]",
  md: "p-[var(--skin-panel-padding)]",
  lg: "p-[var(--skin-panel-padding-spacious)]"
};

export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: SurfaceTone;
  padding?: SurfacePadding;
}

export function Surface({ className, tone = "panel", padding = "md", ...props }: SurfaceProps) {
  return <div className={cn(toneClass[tone], paddingClass[padding], className)} {...props} />;
}

export function Panel(props: SurfaceProps) {
  return <Surface tone="panel" {...props} />;
}

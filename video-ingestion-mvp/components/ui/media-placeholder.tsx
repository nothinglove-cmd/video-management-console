import { skin } from "@/components/theme/skin";
import { FileTypeIcon, type FileTypeIconType } from "@/components/ui/file-type-icon";
import { cn } from "@/lib/utils";

type MediaPlaceholderSize = "sm" | "md" | "lg";

const sizeClass: Record<MediaPlaceholderSize, string> = {
  sm: skin.media.placeholderSm,
  md: skin.media.placeholderMd,
  lg: skin.media.placeholderLg
};

export function MediaPlaceholder({
  type = "unknown",
  label = "暂无缩略图",
  description,
  size = "md",
  className
}: {
  type?: FileTypeIconType;
  label?: string;
  description?: string;
  size?: MediaPlaceholderSize;
  className?: string;
}) {
  return (
    <div className={cn(skin.media.placeholder, sizeClass[size], className)}>
      <FileTypeIcon type={type} className={cn(size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5")} />
      {label ? <span className={cn("font-medium text-foreground/80", skin.typography.badge)}>{label}</span> : null}
      {description ? <span className={cn("max-w-48 text-muted-foreground", skin.typography.meta)}>{description}</span> : null}
    </div>
  );
}

import { FileAudio, FileImage, FileQuestion, FileText, FileVideo, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type FileTypeIconType = "video" | "image" | "audio" | "document" | "unknown";

const iconByType: Record<FileTypeIconType, LucideIcon> = {
  video: FileVideo,
  image: FileImage,
  audio: FileAudio,
  document: FileText,
  unknown: FileQuestion
};

export function FileTypeIcon({
  type = "unknown",
  className
}: {
  type?: FileTypeIconType;
  className?: string;
}) {
  const Icon = iconByType[type] || FileQuestion;
  return <Icon className={cn("h-5 w-5 text-[color:var(--skin-media-placeholder-icon)]", className)} />;
}

export function fileTypeFromMime(mimeType?: string | null): FileTypeIconType {
  if (!mimeType) return "unknown";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.includes("pdf") || mimeType.startsWith("text/") || mimeType.includes("document")) return "document";
  return "unknown";
}

"use client";

import type { MaterialDto } from "@/components/materials/types";
import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export type MaterialIssueType =
  | "CLASSIFICATION_CONFLICT"
  | "NEEDS_REVIEW"
  | "DERIVATIVE_FAILED"
  | "AI_FAILED"
  | "AI_FALLBACK"
  | "NO_PREVIEW";

export type MaterialIssue = {
  type: MaterialIssueType;
  label: string;
  tone: "red" | "orange" | "amber" | "blue" | "slate";
};

export const MATERIAL_ISSUE_OPTIONS: Array<{ value: MaterialIssueType; label: string }> = [
  { value: "CLASSIFICATION_CONFLICT", label: "分类冲突" },
  { value: "NEEDS_REVIEW", label: "需确认" },
  { value: "DERIVATIVE_FAILED", label: "派生失败" },
  { value: "AI_FAILED", label: "AI 失败" },
  { value: "AI_FALLBACK", label: "AI fallback" },
  { value: "NO_PREVIEW", label: "无 Preview" }
];

export function getMaterialIssues(material: MaterialDto): MaterialIssue[] {
  const derivativeFiles = material.derivativeFiles || [];
  const aiAnalysisJobs = material.aiAnalysisJobs || [];
  const activeDerivatives = derivativeFiles.filter((file) => file.status !== "DELETED");
  const hasReadyPreview = activeDerivatives.some((file) => file.type === "PREVIEW_MP4" && file.status === "READY");
  const hasDerivativeFailure = activeDerivatives.some((file) => file.status === "FAILED");
  const hasAiFailure = aiAnalysisJobs.some((job) => job.status === "FAILED" || Boolean(job.errorCode || job.errorMessage));
  const hasAiFallback = aiAnalysisJobs.some((job) => job.usedFallback);
  const isImage = material.mimeType?.startsWith("image/");
  const isVideo = !isImage && (material.mimeType?.startsWith("video/") || Boolean(material.duration));

  return [
    material.classificationConflict ? { type: "CLASSIFICATION_CONFLICT", label: "分类冲突", tone: "red" } : null,
    material.needsHumanReview ? { type: "NEEDS_REVIEW", label: "需确认", tone: "orange" } : null,
    hasDerivativeFailure ? { type: "DERIVATIVE_FAILED", label: "派生失败", tone: "red" } : null,
    hasAiFailure ? { type: "AI_FAILED", label: "AI 失败", tone: "red" } : null,
    hasAiFallback ? { type: "AI_FALLBACK", label: "AI fallback", tone: "amber" } : null,
    isVideo && !hasReadyPreview ? { type: "NO_PREVIEW", label: "无 Preview", tone: "slate" } : null
  ].filter((issue): issue is MaterialIssue => Boolean(issue));
}

export function MaterialIssueBadges({
  material,
  limit,
  className,
  badgeClassName
}: {
  material: MaterialDto;
  limit?: number;
  className?: string;
  badgeClassName?: string;
}) {
  const issues = getMaterialIssues(material);
  const visibleIssues = typeof limit === "number" ? issues.slice(0, limit) : issues;
  const hiddenCount = issues.length - visibleIssues.length;

  if (!issues.length) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)}>
      {visibleIssues.map((issue) => (
        <span
          key={issue.type}
          className={cn(
            "max-w-full truncate rounded-[var(--skin-radius-sm)] px-2 py-0.5 font-semibold",
            skin.typography.badge,
            issueToneClassName(issue.tone),
            badgeClassName
          )}
        >
          {issue.label}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className={cn("rounded-[var(--skin-radius-sm)] bg-slate-100 px-2 py-0.5 font-semibold text-slate-600", skin.typography.badge, badgeClassName)}>
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
}

function issueToneClassName(tone: MaterialIssue["tone"]) {
  if (tone === "red") return "bg-red-50 text-red-700";
  if (tone === "orange") return "bg-orange-50 text-orange-700";
  if (tone === "amber") return "bg-amber-50 text-amber-700";
  if (tone === "blue") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

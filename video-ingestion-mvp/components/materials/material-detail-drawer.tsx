"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  FilePenLine,
  FolderInput,
  ImagePlus,
  MoreHorizontal,
  PackagePlus,
  RefreshCcw,
  Tags,
  Trash2,
  X
} from "lucide-react";

import { type MaterialActions } from "@/components/materials/action-toolbar";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import { ConfidenceBadge } from "@/components/materials/confidence-badge";
import type { AIAnalysisJobDto, DerivativeFileDto, MaterialCategoryDto, MaterialDto } from "@/components/materials/types";
import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { fileTypeFromMime } from "@/components/ui/file-type-icon";
import { MediaPlaceholder } from "@/components/ui/media-placeholder";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { ActionMenu, type ActionMenuItem } from "@/components/ui/action-menu";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { cn, formatBytes, formatDuration, toLocalDateTime } from "@/lib/utils";

const { terminology: terms } = getRuntimeAppConfig();
type DetailTab = "overview" | "classification" | "ai" | "records";
const DETAIL_TABS: TabItem<DetailTab>[] = [
  { value: "overview", label: "概览" },
  { value: "classification", label: "分类与标签" },
  { value: "ai", label: "AI 与派生" },
  { value: "records", label: "记录" }
];

export function MaterialDetailDrawer({
  material,
  onClose,
  actions,
  onPreview
}: {
  material: MaterialDto | null;
  onClose: () => void;
  actions: MaterialActions;
  onPreview: (material: MaterialDto) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  useEffect(() => {
    if (material?.id) {
      setActiveTab("overview");
    }
  }, [material?.id]);

  if (!material) return null;
  const diagnostic = getAiDiagnostic(material);
  const latestSuggestion = getLatestSuggestion(material);
  const vertical = isVerticalMaterial(material);
  const derivativeSummary = summarizeDerivatives(material.derivativeFiles || []);
  const aiJobs = material.aiAnalysisJobs || [];
  const actionItems = getDetailActionItems(material, actions);

  return (
    <div
      style={skin.vars}
      className="fixed inset-x-0 bottom-0 z-40 max-h-[94vh] w-full overflow-hidden rounded-t-[var(--skin-radius-section)] border-t border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] shadow-[var(--skin-shadow-elevated)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:max-w-[var(--skin-drawer-width)] sm:rounded-none sm:border-l sm:border-t-0"
    >
      <div className="border-b border-[color:var(--skin-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className={skin.textDensity.id}>{material.materialId}</p>
              <StatusPill tone={materialStatusTone(material.status)} withDot>{materialStatusLabel(material.status)}</StatusPill>
              {material.needsHumanReview ? <StatusPill tone="review" withDot>需要人工确认</StatusPill> : null}
              {material.classificationConflict ? <StatusPill tone="warning" withDot>分类冲突</StatusPill> : null}
            </div>
            <p className={cn("mt-1 break-words", skin.textDensity.detailFileName)}>{material.storedFileName}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <ActionMenu
              items={actionItems}
              ariaLabel="素材详情操作"
              width={260}
              trigger={({ ref, open, toggle }) => (
                <Button
                  ref={ref}
                  variant="secondary"
                  size="sm"
                  className="min-h-[var(--skin-touch-target-min-height)] px-2.5"
                  aria-expanded={open}
                  onClick={toggle}
                >
                  <MoreHorizontal className="mr-1 h-4 w-4" />
                  操作
                </Button>
              )}
            />
            <Button variant="ghost" size="sm" onClick={onClose} className="min-h-[var(--skin-touch-target-min-height)] px-2.5">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="thin-scrollbar h-[calc(94vh-56px)] overflow-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:h-[calc(100vh-56px)]">
        <button
          type="button"
          className="relative mx-auto mb-4 block w-full overflow-hidden rounded-[var(--skin-radius-panel)] bg-[color:var(--skin-surface-subtle)]"
          style={{
            aspectRatio: getMaterialAspectRatio(material),
            maxHeight: vertical ? "520px" : "260px"
          }}
          onClick={() => onPreview(material)}
        >
          {material.thumbnailPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="h-full w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
          ) : (
            <MediaPlaceholder
              type={fileTypeFromMime(material.mimeType)}
              size="lg"
              label="暂无缩略图"
              description="预览或缩略图生成完成后会显示在这里"
            />
          )}
        </button>

        <div className="mb-4 flex flex-wrap gap-1.5">
          <ConfidenceBadge value={material.aiConfidence} />
          <StatusPill tone="neutral">{material.orientation || "方向未知"}</StatusPill>
          <StatusPill tone="neutral">{material.mimeType || "类型未知"}</StatusPill>
        </div>

        <div className="sticky top-0 z-10 -mx-4 mb-4 border-y border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] px-4 py-2 shadow-[var(--skin-shadow-card)]">
          <Tabs items={DETAIL_TABS} value={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "overview" ? (
          <Section title="概览">
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="原始文件名" value={material.originalFileName} />
              <Info label="当前文件名" value={material.storedFileName} />
              <Info label={terms.shooter.singular} value={material.shooterName || material.uploaderName || "-"} />
              <Info label="上传时间" value={toLocalDateTime(material.createdAt)} />
              <Info label="文件大小" value={formatBytes(material.fileSize)} />
              <Info label="时长" value={formatDuration(material.duration)} />
              <Info label="分辨率" value={`${material.width || "-"}x${material.height || "-"}`} />
              <Info label="方向" value={material.orientation || "方向未知"} />
              <Info label="当前路径" value={material.relativePath} />
              <Info label="原始路径" value={material.originalPath || "-"} />
            </div>
          </Section>
        ) : null}

        {activeTab === "classification" ? (
          <>
            <Section title={terms.category.decision}>
              <CategoryDecisionRow
                label={terms.category.userSelected}
                category={material.userSelectedCategory}
                fallback={formatLegacyCategory(material.userSelectedRootCategory, material.userSelectedSubCategory)}
                fallbackNote={material.userSelectedCategoryId ? `栏目 ID：${material.userSelectedCategoryId}，但关系未返回。` : ""}
              />
              <CategoryDecisionRow
                label={terms.aiSuggestion.category}
                category={material.aiSuggestedCategory}
                fallback={formatLegacyCategory(material.aiSuggestedRootCategory, material.aiSuggestedSubCategory)}
                fallbackNote={material.aiSuggestedCategoryId ? `栏目 ID：${material.aiSuggestedCategoryId}，但关系未返回。` : ""}
              />
              <CategoryDecisionRow
                label={terms.category.final}
                category={material.finalCategory || material.category}
                fallback={formatLegacyCategory(material.finalRootCategory, material.finalSubCategory) || material.categoryPath || material.primaryCategory}
                fallbackNote={material.finalCategoryId || material.categoryId ? `栏目 ID：${material.finalCategoryId || material.categoryId}，但关系未返回。` : ""}
              />
              <Info label="冲突原因" value={material.classificationConflict ? material.conflictReason || "人工选择和 AI 建议不一致。" : "无冲突"} />
            </Section>

            <Section title="分类字段">
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="AI 分类" value={material.primaryCategory} />
                <Info label="主体类型" value={material.subjectType || "-"} />
                <Info label="主体" value={material.subject || "-"} />
                <Info label="场景" value={material.scene || "-"} />
                <Info label="动作" value={material.action || "-"} />
                <Info label="用途" value={material.usage || "-"} />
                <Info label="内容用途" value={material.contentIntent || "-"} />
                <Info label="生命周期" value={material.contentLongevity || "-"} />
                <Info label="专题建议" value={material.topicName || material.topicSuggestion || "-"} />
                <Info label="摘要" value={material.aiSummary || "-"} />
              </div>
            </Section>

            <Section title="标签">
              <div className="grid gap-2 sm:grid-cols-2">
                <Info label="视觉标签" value={tagsToText(material.visualTags) || "-"} />
                <Info label="AI 情绪标签" value={tagsToText(material.aiEmotionTags) || "-"} />
                <Info label="AI 用途标签" value={tagsToText(material.aiUsageTags) || "-"} />
                <Info label="AI 主体标签" value={tagsToText(material.aiSubjectTags) || "-"} />
                <Info label="AI 场景标签" value={tagsToText(material.aiSceneTags) || "-"} />
                <Info label="AI 动作标签" value={tagsToText(material.aiActionTags) || "-"} />
                <Info label="自定义标签" value={tagsToText(material.customTags) || "-"} />
                <Info label="人工标签" value={tagsToText(material.humanTags) || "-"} />
                <Info label="备注" value={material.notes || "-"} />
              </div>
            </Section>
          </>
        ) : null}

        {activeTab === "ai" ? (
          <>
            <Section title={terms.derivativeFile.plural}>
              <DerivativeSummaryCard label="Thumbnail" summary={derivativeSummary.THUMBNAIL} />
              <DerivativeSummaryCard label="Preview MP4" summary={derivativeSummary.PREVIEW_MP4} />
              <DerivativeSummaryCard label="AI Frames" summary={derivativeSummary.AI_FRAME} />
            </Section>

            {latestSuggestion ? (
          <Section title={terms.aiSuggestion.latest}>
            <Surface tone="muted" className={cn("border-emerald-100 bg-emerald-50/60", skin.textDensity.value)}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="success" withDot>最新建议</StatusPill>
                <p className="font-semibold text-foreground">
                  {stringValue(latestSuggestion.assetType) || "-"} · {stringValue(latestSuggestion.primaryCategory) || "-"}
                </p>
              </div>
              <p className="mt-2 text-muted-foreground">
                主体/场景/动作/用途：{[
                  stringValue(latestSuggestion.subject),
                  stringValue(latestSuggestion.scene),
                  stringValue(latestSuggestion.action),
                  stringValue(latestSuggestion.usage)
                ].filter(Boolean).join(" / ") || "-"}
              </p>
              <p className="mt-1 text-muted-foreground">摘要：{stringValue(latestSuggestion.summary) || "-"}</p>
              <p className={cn("mt-2", skin.textDensity.technical)}>
                这是重新 AI 识别生成的新建议。点击头部操作菜单里的“应用建议”后，才会改文件名、路径和素材字段。
              </p>
            </Surface>
          </Section>
            ) : <Surface tone="muted" className={cn("mb-4", skin.textDensity.value, "text-muted-foreground")}>暂无最新 AI 建议。</Surface>}

            <Section title="AI 诊断">
              <details className="rounded-[var(--skin-radius-card)] border border-[color:var(--skin-border)] bg-[color:var(--skin-muted-bg)] p-3">
                <summary className={cn("cursor-pointer font-semibold", skin.textDensity.value)}>
                  {diagnostic.shortReason || diagnostic.ruleReason || diagnostic.reason || "查看诊断详情"}
                </summary>
                <div className={cn("mt-3 grid gap-2", skin.textDensity.history)}>
                  <DiagnosticLine label="请求 Provider" value={diagnostic.requestedProvider || diagnostic.provider || "-"} />
                  <DiagnosticLine label="实际 Provider" value={diagnostic.provider || "-"} />
                  {diagnostic.model ? <DiagnosticLine label="模型" value={diagnostic.model} /> : null}
                  {diagnostic.frameText ? <DiagnosticLine label="关键帧" value={diagnostic.frameText} /> : null}
                  {diagnostic.baseUrl ? <DiagnosticLine label="Base URL" value={diagnostic.baseUrl} /> : null}
                  {diagnostic.imageDetail ? <DiagnosticLine label="图片 detail" value={diagnostic.imageDetail} /> : null}
                  {diagnostic.timeoutMs ? <DiagnosticLine label="超时" value={`${diagnostic.timeoutMs}ms`} /> : null}
                  <DiagnosticLine label="代理" value={diagnostic.proxyEnabled == null ? "-" : diagnostic.proxyEnabled ? "已启用" : "未启用"} />
                  {diagnostic.requestId ? <DiagnosticLine label="Request id" value={diagnostic.requestId} /> : null}
                  {diagnostic.status ? <DiagnosticLine label="状态码" value={String(diagnostic.status)} /> : null}
                  {diagnostic.errorType ? <DiagnosticLine label="错误类型" value={diagnostic.errorType} /> : null}
                  {diagnostic.errorSummary ? <DiagnosticLine label="Provider 错误" value={diagnostic.errorSummary} tone="danger" /> : null}
                  <DiagnosticLine label="Fallback" value={diagnostic.usedFallback == null ? "-" : diagnostic.usedFallback ? "是" : "否"} tone={diagnostic.usedFallback ? "warning" : "neutral"} />
                  {diagnostic.reason ? <DiagnosticLine label="原因" value={diagnostic.reason} /> : null}
                  {diagnostic.checkedFieldsText ? <DiagnosticLine label="检查字段" value={diagnostic.checkedFieldsText} /> : null}
                  {diagnostic.matchedKeywordsText ? <DiagnosticLine label="命中关键词" value={diagnostic.matchedKeywordsText} /> : null}
                  {diagnostic.frameEvidenceText ? <DiagnosticLine label="关键帧证据" value={diagnostic.frameEvidenceText} /> : null}
                  {diagnostic.visualHeuristic ? <DiagnosticLine label="视觉启发式" value={diagnostic.visualHeuristic} /> : null}
                  {diagnostic.suggestion ? <DiagnosticLine label="建议" value={diagnostic.suggestion} /> : null}
                  {diagnostic.warnings.length ? <DiagnosticLine label="Warnings" value={diagnostic.warnings.join("；")} tone="warning" /> : null}
                </div>
              </details>
            </Section>

            <Section title={terms.aiSuggestion.history}>
              <div className="space-y-2">
                {aiJobs.map((job) => (
                  <AIHistoryItem key={job.id} job={job} />
                ))}
                {!aiJobs.length ? <Surface tone="muted" className={cn(skin.textDensity.value, "text-muted-foreground")}>未记录 AIAnalysisJob，可能是旧素材或早期入库数据。</Surface> : null}
              </div>
            </Section>
          </>
        ) : null}

        {activeTab === "records" ? (
          <>
            <Section title="metadata JSON 摘要">
              <pre className={cn("max-h-48 overflow-auto rounded-[var(--skin-radius-card)] bg-slate-950 p-3 text-slate-100", skin.textDensity.metadata)}>
            {JSON.stringify(
              {
                materialId: material.materialId,
                assetType: material.assetType,
                primaryCategory: material.primaryCategory,
                subjectType: material.subjectType,
                subject: material.subject,
                scene: material.scene,
                action: material.action,
                usage: material.usage,
                visualTags: material.visualTags,
                contentIntent: material.contentIntent,
                contentLongevity: material.contentLongevity,
                topicName: material.topicName,
                topicSuggestion: material.topicSuggestion,
                relativePath: material.relativePath,
                aiConfidence: material.aiConfidence,
                status: material.status
              },
              null,
              2
            )}
              </pre>
            </Section>

            <Section title="文件路径">
              <div className="grid gap-2">
                <Info label="当前相对路径" value={material.relativePath} />
                <Info label="绝对路径" value={material.absolutePath || "-"} />
                <Info label="原始接收路径" value={material.originalPath || "-"} />
              </div>
            </Section>

            <Section title="操作日志">
              <div className="space-y-2">
                {(material.operationLogs || []).map((log) => (
                  <Surface key={log.id} tone="muted" padding="sm" className={skin.textDensity.history}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{log.operationType}</p>
                      <p className="text-muted-foreground">{toLocalDateTime(log.createdAt)}</p>
                    </div>
                    {log.notes ? <p className="mt-1 text-muted-foreground">{log.notes}</p> : null}
                  </Surface>
                ))}
                {!material.operationLogs?.length ? <Surface tone="muted" className={cn(skin.textDensity.value, "text-muted-foreground")}>暂无操作日志。</Surface> : null}
              </div>
            </Section>
          </>
        ) : null}

      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h3 className={cn("mb-2", skin.typography.sectionTitle)}>{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function getDetailActionItems(material: MaterialDto, actions: MaterialActions): ActionMenuItem[] {
  return [
    actions.applyAiSuggestion ? { label: "应用建议", icon: CheckCircle2, onSelect: () => actions.applyAiSuggestion?.(material), tone: "primary" } : null,
    actions.rename ? { label: "改名", icon: FilePenLine, onSelect: () => actions.rename?.(material) } : null,
    actions.move ? { label: "分类", icon: FolderInput, onSelect: () => actions.move?.(material) } : null,
    actions.editTags ? { label: "标签", icon: Tags, onSelect: () => actions.editTags?.(material) } : null,
    actions.reanalyze ? { label: "重新识别", icon: RefreshCcw, onSelect: () => actions.reanalyze?.(material) } : null,
    actions.regenerateDerivatives ? { label: "重建缩略图/预览", icon: ImagePlus, onSelect: () => actions.regenerateDerivatives?.(material) } : null,
    actions.addToPackage ? { label: "精选包", icon: PackagePlus, onSelect: () => actions.addToPackage?.(material) } : null,
    { label: "下载", icon: Download, href: `/api/materials/${material.id}/download` },
    actions.trash ? { label: "删除", icon: Trash2, onSelect: () => actions.trash?.(material), tone: "danger" } : null
  ].filter(Boolean) as ActionMenuItem[];
}

function Info({ label, value }: { label: string; value: string }) {
  const pathLike = isPathInfoLabel(label);
  return (
    <Surface tone="raised" padding="sm">
      <p className={skin.textDensity.label}>{label}</p>
      <p className={cn("mt-0.5 font-medium", pathLike ? skin.textDensity.path : skin.textDensity.value, !pathLike && "break-words")}>{value}</p>
    </Surface>
  );
}

function isPathInfoLabel(label: string) {
  return label.includes("路径") || label.includes("目录");
}

function CategoryDecisionRow({
  label,
  category,
  fallback,
  fallbackNote
}: {
  label: string;
  category?: MaterialCategoryDto | null;
  fallback?: string;
  fallbackNote?: string;
}) {
  if (category) {
    return (
      <Surface tone="raised" padding="sm">
        <div className="flex items-center justify-between gap-2">
          <p className={skin.textDensity.label}>{label}</p>
          <StatusPill tone={category.status === "ACTIVE" ? "success" : "neutral"} className="px-1.5 py-0">{category.status}</StatusPill>
        </div>
        <p className={cn("mt-0.5 break-words font-medium", skin.textDensity.value)}>{category.name}</p>
        <p className={cn("mt-1", skin.textDensity.path)}>ID：{category.id}</p>
        <p className={cn("mt-1", skin.textDensity.path)}>路径：{category.relativePath || "未绑定真实目录"}</p>
      </Surface>
    );
  }

  return (
    <Info
      label={label}
      value={fallback ? `${fallback}（兼容旧数据）${fallbackNote ? `；${fallbackNote}` : ""}` : fallbackNote || "未记录"}
    />
  );
}

function DerivativeSummaryCard({
  label,
  summary
}: {
  label: string;
  summary: DerivativeTypeSummary;
}) {
  const latest = summary.latest;
  const statusText = summary.total
    ? `${summary.ready} READY / ${summary.failed} FAILED / ${summary.total} 总数`
    : "缺失";
  return (
    <Surface tone="raised" padding="sm">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("font-medium", skin.textDensity.value)}>{label}</p>
        <DerivativeStatusPill summary={summary} />
      </div>
      <p className={cn("mt-1", skin.textDensity.technical)}>{statusText}</p>
      {latest ? (
        <div className="mt-2 space-y-1">
          <p className={skin.textDensity.path}>最新路径：{latest.relativePath}</p>
          <p className={skin.textDensity.technical}>
            {formatDerivativeMeta(latest)}
            {latest.updatedAt ? ` · ${toLocalDateTime(latest.updatedAt)}` : ""}
          </p>
          {latest.errorMessage ? <p className={cn(skin.textDensity.path, "text-red-600")}>错误：{latest.errorMessage}</p> : null}
        </div>
      ) : (
        <p className={cn("mt-2", skin.textDensity.technical)}>未记录该类型派生文件，可能是旧素材或生成尚未完成。</p>
      )}
    </Surface>
  );
}

function DerivativeStatusPill({ summary }: { summary: DerivativeTypeSummary }) {
  const tone: SkinStatusTone = summary.total === 0
    ? "neutral"
    : summary.failed > 0
      ? "danger"
      : summary.ready > 0
        ? "success"
        : "processing";
  const label = summary.total === 0 ? "缺失" : summary.failed > 0 ? "有失败" : summary.ready > 0 ? "READY" : "处理中";
  return <StatusPill tone={tone} withDot>{label}</StatusPill>;
}

function DiagnosticLine({
  label,
  value,
  tone = "neutral"
}: {
  label: string;
  value: string;
  tone?: SkinStatusTone;
}) {
  return (
    <div className="rounded-[var(--skin-radius-control)] bg-[color:var(--skin-panel-bg)] px-2 py-1.5">
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        <span className="shrink-0 text-muted-foreground">{label}：</span>
        <span className={cn("min-w-0 flex-1 break-all", tone !== "neutral" && skin.status[tone].text)}>{value}</span>
      </div>
    </div>
  );
}

function AIHistoryItem({ job }: { job: AIAnalysisJobDto }) {
  return (
    <Surface tone="raised" padding="sm" className={skin.textDensity.history}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-foreground">{job.providerName || job.providerType || "UNKNOWN"}</span>
        <StatusPill tone={aiJobStatusTone(job.status)} className="px-1.5 py-0">{job.status}</StatusPill>
        {job.usedFallback ? <StatusPill tone="warning" className="px-1.5 py-0">Fallback</StatusPill> : null}
      </div>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <p>模型：{job.modelName || "-"}</p>
        <p>置信度：{formatConfidence(job.confidence)} · 耗时：{formatDurationMs(job.durationMs)}</p>
        <p>时间：{toLocalDateTime(job.createdAt)}</p>
        {job.usedFallback ? <p>Fallback Provider：{job.fallbackProviderType || "-"}</p> : null}
        {job.errorCode || job.errorMessage ? <p className="break-all text-red-600">错误：{[job.errorCode, job.errorMessage].filter(Boolean).join(" / ")}</p> : null}
      </div>
    </Surface>
  );
}

function materialStatusTone(status: string): SkinStatusTone {
  if (["READY", "IMPORTED"].includes(status)) return "success";
  if (["UPLOADED", "PROCESSING", "AI_TAGGED"].includes(status)) return "processing";
  if (status === "NEEDS_REVIEW") return "review";
  if (status === "FAILED") return "danger";
  if (status === "TRASHED") return "neutral";
  return "neutral";
}

function materialStatusLabel(status: string) {
  if (status === "READY") return "已入库";
  if (status === "IMPORTED") return "已导入";
  if (status === "UPLOADED") return "已接收";
  if (status === "PROCESSING") return "处理中";
  if (status === "AI_TAGGED") return "AI 已识别";
  if (status === "NEEDS_REVIEW") return "待确认";
  if (status === "FAILED") return "失败";
  if (status === "TRASHED") return "回收站";
  return status;
}

function aiJobStatusTone(status?: string | null): SkinStatusTone {
  if (status === "SUCCEEDED") return "success";
  if (status === "RUNNING" || status === "QUEUED") return "processing";
  if (status === "FAILED") return "danger";
  return "neutral";
}

function tagsToText(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return Object.values(value).flat().join(", ");
  return "";
}

type DerivativeTypeSummary = {
  total: number;
  ready: number;
  failed: number;
  latest: DerivativeFileDto | null;
};

function summarizeDerivatives(files: DerivativeFileDto[]) {
  return {
    THUMBNAIL: summarizeDerivativeType(files, "THUMBNAIL"),
    PREVIEW_MP4: summarizeDerivativeType(files, "PREVIEW_MP4"),
    AI_FRAME: summarizeDerivativeType(files, "AI_FRAME")
  };
}

function summarizeDerivativeType(files: DerivativeFileDto[], type: DerivativeFileDto["type"]): DerivativeTypeSummary {
  const items = files.filter((file) => file.type === type);
  return {
    total: items.length,
    ready: items.filter((file) => file.status === "READY").length,
    failed: items.filter((file) => file.status === "FAILED").length,
    latest: [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] || null
  };
}

function formatLegacyCategory(root?: string | null, sub?: string | null) {
  return [root, sub].filter(Boolean).join(" / ");
}

function formatDerivativeMeta(file: DerivativeFileDto) {
  const parts = [
    file.fileSize ? formatBytes(file.fileSize) : "",
    file.width && file.height ? `${file.width}x${file.height}` : "",
    file.duration ? formatDuration(file.duration) : "",
    file.frameIndex ? `Frame ${file.frameIndex}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "无尺寸信息";
}

function formatConfidence(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function formatDurationMs(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function getLatestSuggestion(material: MaterialDto) {
  const aiResult = asRecord(material.aiResult);
  return asRecord(aiResult?.latestSuggestion);
}

function getAiDiagnostic(material: MaterialDto) {
  const aiResult = asRecord(material.aiResult);
  const latestSuggestion = asRecord(aiResult?.latestSuggestion);
  const activeResult = latestSuggestion ?? aiResult;
  const diagnostics =
    asRecord(aiResult?._diagnostics) ?? asRecord(activeResult?.diagnostics) ?? asRecord(aiResult?.diagnostics);
  const ruleDecision = asRecord(aiResult?._ruleDecision) ?? asRecord(activeResult?._ruleDecision);
  const warnings = [...stringArray(aiResult?._warnings), ...stringArray(activeResult?._warnings)];
  const requestedProvider = stringValue(aiResult?._requestedProvider) || stringValue(diagnostics?.requestedProvider);
  const provider =
    stringValue(aiResult?._provider) || stringValue(diagnostics?.actualProvider) || stringValue(diagnostics?.provider);
  const usedFallback = booleanValue(aiResult?._usedFallback) ?? booleanValue(diagnostics?.fallbackUsed);
  const errorSummary = stringValue(diagnostics?.errorSummary);

  return {
    requestedProvider,
    provider,
    usedFallback,
    model: stringValue(diagnostics?.model),
    baseUrl: stringValue(diagnostics?.baseUrl),
    imageDetail: stringValue(diagnostics?.imageDetail),
    timeoutMs: numberValue(diagnostics?.timeoutMs),
    proxyEnabled: booleanValue(diagnostics?.proxyEnabled),
    requestId: stringValue(diagnostics?.requestId),
    status: numberValue(diagnostics?.status),
    errorType: stringValue(diagnostics?.errorType),
    errorSummary,
    frameText: formatFrameSend(diagnostics),
    shortReason:
      requestedProvider === "openai" && usedFallback
        ? `OpenAI 调用失败，已回退 mock：${errorSummary || warnings[0] || "查看详情"}`
        : requestedProvider === "volcengine" && usedFallback
          ? `火山方舟调用失败，已回退 mock：${errorSummary || warnings[0] || "查看详情"}`
        : "",
    ruleReason: stringValue(ruleDecision?.reason),
    reason: stringValue(diagnostics?.reason),
    suggestion: stringValue(diagnostics?.suggestion),
    checkedFieldsText: formatCheckedFields(asRecord(diagnostics?.checkedFields)),
    matchedKeywordsText: formatKeywordMatches(asRecord(diagnostics?.matchedKeywords)),
    frameEvidenceText: formatFrameEvidence(asRecord(diagnostics?.frameAnalysis)),
    visualHeuristic: stringValue(diagnostics?.visualHeuristic),
    warnings
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : "";
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function formatFrameSend(diagnostics: Record<string, unknown> | null) {
  if (!diagnostics) return "";
  const frameCount = numberValue(diagnostics.frameCount);
  const sentFrameCount = numberValue(diagnostics.sentFrameCount);
  if (frameCount === null && sentFrameCount === null) return "";
  return `发送 ${sentFrameCount ?? 0}/${frameCount ?? 0} 张`;
}

function formatCheckedFields(fields: Record<string, unknown> | null) {
  if (!fields) return "";
  const labels: Record<string, string> = {
    originalFileName: "原文件名",
    uploaderName: "上传人",
    notes: "备注",
    manualAssetType: "手动类型"
  };
  return Object.entries(fields)
    .map(([key, value]) => `${labels[key] || key}=${String(value || "空")}`)
    .join("；");
}

function formatKeywordMatches(matches: Record<string, unknown> | null) {
  if (!matches) return "";
  const labels: Record<string, string> = {
    account: "账号素材",
    product: "产品素材",
    reference: "对标视频"
  };
  return Object.entries(matches)
    .map(([key, value]) => {
      const words = Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
      return `${labels[key] || key}=${words.length ? words.join("、") : "无"}`;
    })
    .join("；");
}

function formatFrameEvidence(frameAnalysis: Record<string, unknown> | null) {
  if (!frameAnalysis) return "";
  const hints = stringArray(frameAnalysis.visualHints);
  const frameCount = typeof frameAnalysis.frameCount === "number" ? frameAnalysis.frameCount : null;
  const analyzedFrameCount = typeof frameAnalysis.analyzedFrameCount === "number" ? frameAnalysis.analyzedFrameCount : null;
  const brightness = typeof frameAnalysis.averageBrightness === "number" ? frameAnalysis.averageBrightness : null;
  const saturation = typeof frameAnalysis.averageSaturation === "number" ? frameAnalysis.averageSaturation : null;
  const dominantTone = stringValue(frameAnalysis.dominantTone);
  const metrics = [
    frameCount !== null && analyzedFrameCount !== null ? `已分析 ${analyzedFrameCount}/${frameCount} 张` : "",
    brightness !== null ? `亮度 ${brightness}` : "",
    saturation !== null ? `饱和度 ${saturation}` : "",
    dominantTone ? `主色倾向 ${dominantTone}` : ""
  ].filter(Boolean);

  return [...metrics, ...hints].join("；");
}

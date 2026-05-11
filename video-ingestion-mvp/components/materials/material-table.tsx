"use client";

import { ConfidenceBadge } from "@/components/materials/confidence-badge";
import { MaterialIssueBadges } from "@/components/materials/material-issue-badges";
import { StatusBadge } from "@/components/materials/status-badge";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import type { MaterialDto } from "@/components/materials/types";
import { skin } from "@/components/theme/skin";
import { fileTypeFromMime } from "@/components/ui/file-type-icon";
import { MediaPlaceholder } from "@/components/ui/media-placeholder";
import { ResponsiveTableShell } from "@/components/ui/responsive-table-shell";
import { cn, toLocalDateTime } from "@/lib/utils";

export function MaterialTable({
  materials,
  onOpen,
  showDeletedAt = false
}: {
  materials: MaterialDto[];
  onOpen?: (material: MaterialDto) => void;
  showDeletedAt?: boolean;
}) {
  return (
    <ResponsiveTableShell className="max-w-full">
      <table className={cn("w-full min-w-[900px]", skin.typography.tableCell)}>
        <thead className={skin.table.header}>
          <tr>
            <th className="px-2 py-2 text-left lg:px-3">缩略图</th>
            <th className="px-2 py-2 text-left lg:px-3">素材 ID</th>
            <th className="px-3 py-2 text-left">文件名</th>
            <th className="px-3 py-2 text-left">拍摄人</th>
            <th className="px-3 py-2 text-left">AI 分类</th>
            <th className="px-3 py-2 text-left">索引</th>
            <th className="px-3 py-2 text-left">问题</th>
            <th className="px-3 py-2 text-left">置信度</th>
            <th className="px-3 py-2 text-left">状态</th>
            <th className="px-3 py-2 text-left">{showDeletedAt ? "删除时间" : "上传时间"}</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((material) => (
            <tr key={material.id} className={`${skin.table.row} cursor-pointer`} onClick={() => onOpen?.(material)}>
              <td className="px-2 py-2 lg:px-3">
                <div
                  className={skin.media.thumbnail}
                  style={{
                    aspectRatio: getMaterialAspectRatio(material),
                    width: isVerticalMaterial(material) ? 34 : 64,
                    height: 48
                  }}
                >
                  {material.thumbnailPath ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="h-full w-full object-contain" alt={material.storedFileName} src={`/api/materials/${material.id}/thumbnail`} />
                  ) : (
                    <MediaPlaceholder type={fileTypeFromMime(material.mimeType)} label="" size="sm" />
                  )}
                </div>
              </td>
              <td className={cn("whitespace-nowrap px-2 py-2 lg:px-3", skin.textDensity.id)}>{material.materialId}</td>
              <td className="max-w-[300px] px-3 py-2">
                <span className={cn("line-clamp-2", skin.textDensity.tableFileName)}>{material.storedFileName}</span>
              </td>
              <td className={cn("whitespace-nowrap px-3 py-2", skin.textDensity.technical)}>{material.shooterName || material.uploaderName || "-"}</td>
              <td className={cn("max-w-[220px] truncate px-3 py-2", skin.textDensity.technical)}>{material.primaryCategory}</td>
              <td className={cn("max-w-[220px] px-3 py-2", skin.textDensity.technical)}>
                <span className="line-clamp-2 break-words">{[material.subjectType, material.subject, material.usage, material.topicName || material.topicSuggestion].filter(Boolean).join(" · ") || "-"}</span>
              </td>
              <td className="min-w-[160px] px-3 py-2"><MaterialIssueBadges material={material} limit={3} /></td>
              <td className="px-3 py-2"><ConfidenceBadge value={material.aiConfidence} /></td>
              <td className="px-3 py-2"><StatusBadge status={material.status} /></td>
              <td className={cn("whitespace-nowrap px-3 py-2", skin.textDensity.technical)}>{toLocalDateTime(showDeletedAt ? material.updatedAt || material.createdAt : material.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ResponsiveTableShell>
  );
}

"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getMaterialAspectRatio, isVerticalMaterial } from "@/components/materials/aspect-ratio";
import type { MaterialDto } from "@/components/materials/types";

export function VideoPreviewDialog({
  material,
  onClose
}: {
  material: MaterialDto | null;
  onClose: () => void;
}) {
  if (!material) return null;
  const isImage = material.mimeType?.startsWith("image/");
  const vertical = isVerticalMaterial(material);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full overflow-auto rounded-xl bg-white p-4 shadow-2xl"
        style={{ maxWidth: vertical ? "520px" : "1100px" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{material.materialId}</p>
            <h3 className="truncate text-base font-semibold">{material.storedFileName}</h3>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="mx-auto max-h-[76vh] rounded-lg object-contain"
            style={{ aspectRatio: getMaterialAspectRatio(material), width: vertical ? "auto" : "100%" }}
            alt={material.storedFileName}
            src={`/api/materials/${material.id}/preview`}
          />
        ) : (
          <video
            className="mx-auto max-h-[76vh] rounded-lg bg-black"
            style={{ aspectRatio: getMaterialAspectRatio(material), width: vertical ? "auto" : "100%" }}
            controls
            src={`/api/materials/${material.id}/preview`}
          />
        )}
      </div>
    </div>
  );
}

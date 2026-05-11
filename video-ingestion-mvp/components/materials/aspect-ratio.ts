import type { MaterialDto } from "@/components/materials/types";

export function getMaterialAspectRatio(material: MaterialDto) {
  const width = material.width || 0;
  const height = material.height || 0;
  if (width > 0 && height > 0) return `${width} / ${height}`;
  if (material.orientation === "horizontal") return "16 / 9";
  if (material.orientation === "square") return "1 / 1";
  return "9 / 16";
}

export function isVerticalMaterial(material: MaterialDto) {
  if (material.width && material.height) return material.height > material.width;
  return material.orientation === "vertical" || !material.orientation;
}

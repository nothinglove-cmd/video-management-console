import { NextResponse } from "next/server";

import { canReadMaterial, findMaterial, getRouteId, materialReadDeniedResponse, requireApiUser } from "@/app/api/_utils";
import { toUsageDto } from "@/lib/material-packages/material-packages";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const material = await findMaterial(id);
  if (!material) return NextResponse.json({ error: "素材不存在。" }, { status: 404 });
  if (!canReadMaterial(auth.user, material)) return materialReadDeniedResponse();

  const usages = await prisma.materialUsage.findMany({
    where: { materialId: material.materialId },
    orderBy: { createdAt: "desc" }
  });
  const packageIds = usages.filter((usage) => usage.usageType === "PACKAGE").map((usage) => usage.usageRefId);
  const packages = packageIds.length
    ? await prisma.materialPackage.findMany({
      where: { packageId: { in: packageIds } }
    })
    : [];
  const packageById = new Map(packages.map((pkg) => [pkg.packageId, pkg]));

  return NextResponse.json({
    materialId: material.materialId,
    usages: usages.map((usage) => toUsageDto(usage, packageById))
  });
}

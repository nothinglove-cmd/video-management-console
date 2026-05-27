import { NextResponse } from "next/server";
import type { SourceType, UserRole } from "@prisma/client";
import type { Material } from "@prisma/client";

import { authErrorResponse, requireRole, requireUser, type AuthUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

type ApiAuthResult = { user: AuthUser } | { response: NextResponse };

export async function requireApiUser(request: Request): Promise<ApiAuthResult> {
  try {
    return { user: await requireUser(request) };
  } catch (error) {
    return { response: authErrorResponse(error) ?? jsonError("认证失败。", 500) };
  }
}

export async function requireApiRole(request: Request, roles: UserRole[]): Promise<ApiAuthResult> {
  try {
    return { user: await requireRole(request, roles) };
  } catch (error) {
    return { response: authErrorResponse(error) ?? jsonError("认证失败。", 500) };
  }
}

export async function requireSuperAdmin(request: Request) {
  return requireApiRole(request, ["SUPER_ADMIN"]);
}

export async function requireAdmin(request: Request) {
  return requireApiRole(request, ["SUPER_ADMIN", "ADMIN"]);
}

export function authOperatorName(user: AuthUser) {
  return user.displayName || user.username;
}

export function isAdminUser(user: AuthUser) {
  return user.role === "SUPER_ADMIN" || user.role === "ADMIN";
}

export function canReadMaterial(user: AuthUser, material: Pick<Material, "status">) {
  return isAdminUser(user) || material.status === "READY" || material.status === "IMPORTED";
}

export function materialReadDeniedResponse() {
  return jsonError("当前账号只能查看已入库素材。", 403);
}

export function canUseUploadSourceType(user: AuthUser, sourceType: SourceType) {
  if (isAdminUser(user)) return true;
  return sourceType === "WEB_MOBILE_UPLOAD" || sourceType === "WEB_DESKTOP_UPLOAD";
}

export function uploadSourceDeniedResponse() {
  return jsonError("普通用户只能使用网页上传。", 403);
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

export async function findMaterial(id: string): Promise<Material | null> {
  return prisma.material.findFirst({
    where: {
      OR: [{ id }, { materialId: id }]
    }
  });
}

export async function requireMaterial(id: string) {
  const material = await findMaterial(id);
  if (!material) throw new Error("素材不存在。");
  return material;
}

export async function getRouteId(context: { params: Promise<{ id: string }> | { id: string } }) {
  const params = await Promise.resolve(context.params);
  return params.id;
}

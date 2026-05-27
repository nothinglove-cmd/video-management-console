import { NextResponse } from "next/server";
import type { UserRole, UserStatus } from "@prisma/client";

import { getRouteId, jsonError, readJson, requireApiRole } from "@/app/api/_utils";
import { hashPassword, generateReadablePassword } from "@/lib/auth/password";
import { ADMIN_ROLES, canCreateRole, canManageTargetRole } from "@/lib/auth/permissions";
import { publicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "USER"];
const STATUSES: UserStatus[] = ["ACTIVE", "DISABLED"];

type UpdateUserBody = {
  displayName?: string;
  role?: UserRole;
  status?: UserStatus;
  resetPassword?: boolean;
  password?: string;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(request, ADMIN_ROLES);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const body = await readJson<UpdateUserBody>(request);
  const target = await prisma.userAccount.findUnique({ where: { id } });
  if (!target) return jsonError("用户不存在。", 404);
  if (!canManageTargetRole(auth.user.role, target.role)) return jsonError("当前账号不能管理该用户。", 403);
  if (target.id === auth.user.id && (body.status === "DISABLED" || (body.role && body.role !== target.role))) {
    return jsonError("不能停用当前登录账号或修改自己的角色。", 400);
  }

  const data: {
    displayName?: string;
    role?: UserRole;
    status?: UserStatus;
    passwordHash?: string;
    mustChangePassword?: boolean;
  } = {};

  if (typeof body.displayName === "string" && body.displayName.trim()) {
    data.displayName = body.displayName.trim();
  }
  if (body.role && ROLES.includes(body.role)) {
    if (!canCreateRole(auth.user.role, body.role)) return jsonError("当前账号不能分配该角色。", 403);
    data.role = body.role;
  }
  if (body.status && STATUSES.includes(body.status)) data.status = body.status;

  let password: string | undefined;
  if (body.resetPassword) {
    password = String(body.password || "").trim() || generateReadablePassword();
    data.passwordHash = await hashPassword(password);
    data.mustChangePassword = true;
    await prisma.userSession.deleteMany({ where: { userId: target.id } });
  }

  const updated = await prisma.userAccount.update({ where: { id }, data });
  return NextResponse.json({ user: publicUser(updated), password });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(request, ADMIN_ROLES);
  if ("response" in auth) return auth.response;

  const id = await getRouteId(context);
  const target = await prisma.userAccount.findUnique({ where: { id } });
  if (!target) return jsonError("用户不存在。", 404);
  if (target.id === auth.user.id) return jsonError("不能停用当前登录账号。", 400);
  if (!canManageTargetRole(auth.user.role, target.role)) return jsonError("当前账号不能管理该用户。", 403);

  const updated = await prisma.userAccount.update({
    where: { id },
    data: { status: "DISABLED" }
  });
  await prisma.userSession.deleteMany({ where: { userId: id } });
  return NextResponse.json({ user: publicUser(updated) });
}

import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";

import { authOperatorName, jsonError, readJson, requireApiRole } from "@/app/api/_utils";
import { hashPassword, generateReadablePassword } from "@/lib/auth/password";
import { ADMIN_ROLES, canCreateRole } from "@/lib/auth/permissions";
import { publicUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["SUPER_ADMIN", "ADMIN", "USER"];

type CreateUserBody = {
  username?: string;
  displayName?: string;
  role?: UserRole;
  password?: string;
};

export async function GET(request: Request) {
  const auth = await requireApiRole(request, ADMIN_ROLES);
  if ("response" in auth) return auth.response;

  const users = await prisma.userAccount.findMany({
    where: auth.user.role === "SUPER_ADMIN" ? {} : { role: "USER" },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }]
  });
  return NextResponse.json({ users: users.map(publicUser), currentUser: publicUser(auth.user) });
}

export async function POST(request: Request) {
  const auth = await requireApiRole(request, ADMIN_ROLES);
  if ("response" in auth) return auth.response;

  const body = await readJson<CreateUserBody>(request);
  const username = String(body.username || "").trim();
  const displayName = String(body.displayName || username).trim();
  const role = ROLES.includes(body.role as UserRole) ? body.role as UserRole : "USER";

  if (!username || !displayName) return jsonError("用户名和显示名不能为空。");
  if (!canCreateRole(auth.user.role, role)) return jsonError("当前账号不能创建该角色。", 403);

  const password = String(body.password || "").trim() || generateReadablePassword();
  const workspace = await getDefaultWorkspaceContext();
  try {
    const user = await prisma.userAccount.create({
      data: {
        workspaceId: workspace.workspaceId,
        username,
        displayName,
        role,
        passwordHash: await hashPassword(password),
        status: "ACTIVE",
        mustChangePassword: true
      }
    });
    return NextResponse.json({
      user: publicUser(user),
      password,
      message: `${authOperatorName(auth.user)} 已创建用户。`
    });
  } catch (error) {
    return jsonError((error as Error).message);
  }
}

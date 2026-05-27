import type { UserRole } from "@prisma/client";

import { hashPassword, generateReadablePassword } from "./password";
import { prisma } from "../prisma";
import { ensureDefaultWorkspace } from "../workspace/default-workspace.service";

export type BootstrapAdminResult = {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  password?: string;
  created: boolean;
};

export async function ensureBootstrapSuperAdmin(): Promise<BootstrapAdminResult> {
  const existing = await prisma.userAccount.findFirst({
    where: { role: "SUPER_ADMIN", status: "ACTIVE" },
    orderBy: { createdAt: "asc" }
  });
  if (existing) {
    return {
      userId: existing.id,
      username: existing.username,
      displayName: existing.displayName,
      role: existing.role,
      created: false
    };
  }

  const defaults = await ensureDefaultWorkspace();
  const username = process.env.INITIAL_ADMIN_USERNAME?.trim() || "admin";
  const displayName = process.env.INITIAL_ADMIN_DISPLAY_NAME?.trim() || "超级管理员";
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim() || generateReadablePassword();
  const passwordHash = await hashPassword(password);
  const user = await prisma.userAccount.upsert({
    where: { username },
    create: {
      workspaceId: defaults.workspace.id,
      username,
      displayName,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: true
    },
    update: {
      workspaceId: defaults.workspace.id,
      displayName,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: true
    }
  });

  return {
    userId: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    password,
    created: true
  };
}

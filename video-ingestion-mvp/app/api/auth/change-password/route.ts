import { NextResponse } from "next/server";

import { readJson } from "@/app/api/_utils";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401 });

  const body = await readJson<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>(request);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  const confirmPassword = String(body.confirmPassword || "");
  if (!currentPassword || !newPassword) return NextResponse.json({ error: "请输入当前密码和新密码。" }, { status: 400 });
  if (newPassword !== confirmPassword) return NextResponse.json({ error: "两次输入的新密码不一致。" }, { status: 400 });
  if (newPassword.length < 8) return NextResponse.json({ error: "新密码至少需要 8 位。" }, { status: 400 });
  if (newPassword === currentPassword) return NextResponse.json({ error: "新密码不能和当前密码相同。" }, { status: 400 });

  const account = await prisma.userAccount.findUnique({ where: { id: user.id } });
  if (!account || account.status !== "ACTIVE") return NextResponse.json({ error: "账号不可用。" }, { status: 403 });
  if (!(await verifyPassword(currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: "当前密码不正确。" }, { status: 401 });
  }

  await prisma.userAccount.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false
    }
  });

  return NextResponse.json({ ok: true });
}

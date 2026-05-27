import { NextResponse } from "next/server";

import { verifyPassword } from "@/lib/auth/password";
import { createSession, publicUser, setSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "请输入用户名和密码。" }, { status: 400 });
  }

  const user = await prisma.userAccount.findUnique({ where: { username } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "用户名或密码不正确。" }, { status: 401 });
  }

  const session = await createSession(user.id);
  await prisma.userAccount.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });

  const response = NextResponse.json({ user: publicUser(user) });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}

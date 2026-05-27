import { createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { UserAccount, UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "video_ingestion_session";
const SESSION_DAYS = 7;

export type AuthUser = Pick<
  UserAccount,
  "id" | "username" | "displayName" | "role" | "status" | "mustChangePassword"
>;

export class AuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
    this.name = "AuthError";
  }
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getAuthSecret()).update(token).digest("hex");
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt
    }
  });
  return { token, expiresAt };
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

export async function getCurrentUserFromToken(token?: string | null): Promise<AuthUser | null> {
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) await prisma.userSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (session.user.status !== "ACTIVE") return null;
  return session.user;
}

export async function getCurrentUser(request?: Request) {
  const token = request
    ? readCookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME)
    : (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return getCurrentUserFromToken(token);
}

export async function requireUser(request?: Request) {
  const user = await getCurrentUser(request);
  if (!user) throw new AuthError("请先登录。", 401);
  if (request && user.mustChangePassword && !isPasswordChangeAllowed(request.url)) {
    throw new AuthError("请先修改初始密码。", 403);
  }
  return user;
}

export async function requireRole(request: Request | undefined, roles: UserRole[]) {
  const user = await requireUser(request);
  if (!roles.includes(user.role)) throw new AuthError("当前账号没有权限执行此操作。", 403);
  return user;
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}

export function roleAtLeast(role: UserRole, minimum: UserRole) {
  const rank: Record<UserRole, number> = {
    USER: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3
  };
  return rank[role] >= rank[minimum];
}

function readCookieFromHeader(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new AuthError("AUTH_SECRET 未配置或长度不足。", 500);
  }
  return secret;
}

function isPasswordChangeAllowed(url: string) {
  try {
    const pathname = new URL(url).pathname;
    return pathname === "/api/auth/change-password" || pathname === "/api/auth/logout" || pathname === "/api/auth/me";
  } catch {
    return false;
  }
}

import { NextResponse } from "next/server";

import { clearSessionCookie, hashSessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const token = readCookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (token) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}

function readCookieFromHeader(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

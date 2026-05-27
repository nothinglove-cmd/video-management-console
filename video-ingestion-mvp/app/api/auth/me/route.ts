import { NextResponse } from "next/server";

import { getCurrentUser, publicUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return NextResponse.json({ user: user ? publicUser(user) : null });
}

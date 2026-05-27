import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { fixSafeStorageIssues } from "@/lib/repair/repair.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const issueIds = Array.isArray(body.issueIds)
    ? body.issueIds.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  if (issueIds.length === 0) {
    return NextResponse.json({ error: "请选择要安全修复的问题。" }, { status: 400 });
  }

  return NextResponse.json(await fixSafeStorageIssues(issueIds));
}

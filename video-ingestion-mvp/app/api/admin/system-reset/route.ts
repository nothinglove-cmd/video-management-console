import { NextResponse } from "next/server";

import { authOperatorName, requireSuperAdmin } from "@/app/api/_utils";

import { executeSystemReset } from "@/lib/admin/system-reset.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const input = await request.json().catch(() => ({}));
    const result = await executeSystemReset({ ...input, operatorName: authOperatorName(auth.user) });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "系统初始化执行失败。" },
      { status: 400 }
    );
  }
}

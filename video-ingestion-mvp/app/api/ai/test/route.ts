import { NextResponse } from "next/server";

import { materialClassifierService } from "@/modules/ai/material-classifier.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { configId?: unknown };
    const configId = typeof body.configId === "string" ? body.configId : undefined;
    const result = await materialClassifierService.testAiConnection({ configId });
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "unknown",
        model: "",
        message: `AI Provider 连接测试失败：${(error as Error).message}`,
        diagnostics: {
          errorType: "test_route_error"
        }
      },
      { status: 400 }
    );
  }
}

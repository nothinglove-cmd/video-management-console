import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { redactSensitiveText, sanitizeDiagnostics } from "@/lib/security/redaction";
import { materialClassifierService } from "@/modules/ai/material-classifier.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as { configId?: unknown };
    const configId = typeof body.configId === "string" ? body.configId : undefined;
    const result = await materialClassifierService.testAiConnection({ configId });
    return NextResponse.json(sanitizeAiTestResult(result), { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        provider: "unknown",
        model: "",
        message: redactSensitiveText(`AI Provider 连接测试失败：${(error as Error).message}`),
        diagnostics: {
          errorType: "test_route_error"
        }
      },
      { status: 400 }
    );
  }
}

function sanitizeAiTestResult(result: Awaited<ReturnType<typeof materialClassifierService.testAiConnection>>) {
  return {
    ...result,
    message: redactSensitiveText(result.message),
    outputText: typeof result.outputText === "string" ? redactSensitiveText(result.outputText) : result.outputText,
    diagnostics: sanitizeDiagnostics(result.diagnostics)
  };
}

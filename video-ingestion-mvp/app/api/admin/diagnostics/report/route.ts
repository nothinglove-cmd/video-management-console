import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { buildDiagnosticsFileName, getDiagnosticsReport } from "@/lib/admin/diagnostics-report.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const report = await getDiagnosticsReport();
  const filename = buildDiagnosticsFileName(report.generatedAt);

  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

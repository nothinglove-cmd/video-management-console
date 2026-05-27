import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const config = await aiProviderConfigService.activateConfig(id);
  return NextResponse.json(config);
}

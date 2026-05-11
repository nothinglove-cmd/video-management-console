import { NextResponse } from "next/server";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = await aiProviderConfigService.activateConfig(id);
  return NextResponse.json(config);
}

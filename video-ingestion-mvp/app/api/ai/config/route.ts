import { NextResponse } from "next/server";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const config = await aiProviderConfigService.getConfigOverview();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.createConfig(body);
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.saveConfig(body);
  return NextResponse.json(config);
}

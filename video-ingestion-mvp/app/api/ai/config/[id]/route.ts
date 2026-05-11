import { NextResponse } from "next/server";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = await aiProviderConfigService.getPublicConfigById(id);
  return NextResponse.json(config);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.updateConfig(id, body);
  return NextResponse.json(config);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const config = await aiProviderConfigService.deleteConfig(id);
  return NextResponse.json(config);
}

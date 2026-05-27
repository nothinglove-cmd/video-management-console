import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const config = await aiProviderConfigService.getPublicConfigById(id);
  return NextResponse.json(config);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.updateConfig(id, body);
  return NextResponse.json(config);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const config = await aiProviderConfigService.deleteConfig(id);
  return NextResponse.json(config);
}

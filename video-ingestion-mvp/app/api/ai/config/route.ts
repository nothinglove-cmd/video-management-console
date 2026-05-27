import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const config = await aiProviderConfigService.getConfigOverview();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.createConfig(body);
  return NextResponse.json(config);
}

export async function PUT(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const config = await aiProviderConfigService.saveConfig(body);
  return NextResponse.json(config);
}

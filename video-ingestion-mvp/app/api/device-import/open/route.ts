import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { NextResponse } from "next/server";

import { requireSuperAdmin } from "@/app/api/_utils";

import { storageService } from "@/lib/storage/storage.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const deviceImportPath = storageService.resolve("01_待导入/设备拷贝");
  try {
    await execFileAsync("open", [deviceImportPath]);
    return NextResponse.json({ ok: true, path: deviceImportPath });
  } catch (error) {
    return NextResponse.json(
      { ok: false, path: deviceImportPath, error: (error as Error).message },
      { status: 500 }
    );
  }
}

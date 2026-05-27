import { NextResponse } from "next/server";

import { authOperatorName, requireSuperAdmin } from "@/app/api/_utils";

import { listCategories, toCategoryTree } from "@/lib/categories/category.service";
import { createRealDirectory } from "@/lib/directories/directory.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  const categories = await listCategories();
  const childrenByParent = categories.reduce<Record<string, typeof categories>>((acc, category) => {
    const key = category.parentId || "ROOT";
    acc[key] = [...(acc[key] || []), category];
    return acc;
  }, {});
  return NextResponse.json({
    categories,
    tree: toCategoryTree(categories),
    roots: childrenByParent.ROOT || [],
    childrenByParent
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperAdmin(request);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.parentId) {
      return NextResponse.json({ error: "栏目名称和父级目录不能为空；栏目必须通过真实目录创建。" }, { status: 400 });
    }
    const category = await createRealDirectory({
      parentId: String(body.parentId),
      name: String(body.name),
      folderName: body.folderName ? String(body.folderName) : undefined,
      sortOrder: Number(body.sortOrder || 100),
      allowUpload: body.allowUpload !== false,
      operatorName: authOperatorName(auth.user),
      notes: body.notes || null
    });
    return NextResponse.json({ category });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

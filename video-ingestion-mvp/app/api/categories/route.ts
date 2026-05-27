import { NextResponse } from "next/server";

import { requireApiUser } from "@/app/api/_utils";
import { listCategories, toCategoryTree } from "@/lib/categories/category.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if ("response" in auth) return auth.response;

  const categories = await listCategories({ ensureDefaults: false });
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

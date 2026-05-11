import { CategoryAdmin } from "@/components/admin/category-admin";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Categories"
        title="栏目管理"
        description="维护逻辑栏目和稳定物理目录的映射。具体内容题材优先进入标签和搜索索引，不无限新增文件夹。"
      />
      <CategoryAdmin />
    </AppShell>
  );
}

import { MaterialAdmin } from "@/components/admin/material-admin";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function TrashPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Trash"
        title="回收站"
        description="删除不会物理移除文件，只会移动到 99_回收站；这里可以搜索、批量恢复或查看详情。"
      />
      <MaterialAdmin mode="trash" />
    </AppShell>
  );
}

import { UserAdmin } from "@/components/admin/user-admin";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export default async function UsersPage() {
  await requirePageRole("ADMIN");
  return (
    <AppShell>
      <PageHeader title="用户管理" description="创建、停用和重置本地账号。管理员只能管理普通用户。" />
      <UserAdmin />
    </AppShell>
  );
}

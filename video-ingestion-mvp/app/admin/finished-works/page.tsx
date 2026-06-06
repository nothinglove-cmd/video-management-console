import { FinishedWorkWorkbench } from "@/components/admin/finished-work-workbench";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function FinishedWorksPage() {
  await requirePageRole("ADMIN");

  return (
    <AppShell>
      <PageHeader
        eyebrow="Finished Works"
        title="成片记录"
        description="记录成片、交付件和发布版本实际使用了哪些精选包素材，打通素材使用闭环。"
      />
      <FinishedWorkWorkbench />
    </AppShell>
  );
}

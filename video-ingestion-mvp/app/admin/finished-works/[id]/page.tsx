import { FinishedWorkWorkbench } from "@/components/admin/finished-work-workbench";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { requirePageRole } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export default async function FinishedWorkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageRole("ADMIN");
  const { id } = await params;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Finished Work"
        title="成片记录详情"
        description="查看成片或交付件的实际使用素材，并维护素材使用记录。"
      />
      <FinishedWorkWorkbench initialWorkId={id} />
    </AppShell>
  );
}

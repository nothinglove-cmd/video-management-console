import { MaterialAdmin } from "@/components/admin/material-admin";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function IngestReviewPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Ingest Queue"
        title="入库队列"
        description="集中处理 AI 分类建议、低置信度素材和人工确认。点击素材查看右侧详情抽屉。"
      />
      <MaterialAdmin mode="ingest" />
    </AppShell>
  );
}

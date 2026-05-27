import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { DiagnosticsReportButton } from "@/components/settings/diagnostics-report-button";
import { EnvironmentAccessPanel } from "@/components/settings/environment-access-panel";
import { SectionPanel, SettingsBackLink } from "@/components/settings/settings-page-parts";
import { StatusPill } from "@/components/ui/status-pill";
import { getEnvironmentStatus } from "@/lib/admin/environment-status.service";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getNetworkAccessInfo } from "@/lib/network/access-info";

export const dynamic = "force-dynamic";

export default async function EnvironmentSettingsPage() {
  await requirePageRole("SUPER_ADMIN");
  const environmentStatus = await getEnvironmentStatus();
  const accessInfo = getNetworkAccessInfo();
  const ready = environmentStatus.mediaTools.ffmpeg.available && environmentStatus.mediaTools.ffprobe.available;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings / Environment"
        title="环境与访问"
        description="查看 FFmpeg / ffprobe 状态、本机和局域网访问地址，并导出不含密钥和素材文件的诊断报告。"
      />
      <div className="mt-4 space-y-4">
        <SettingsBackLink />
        <SectionPanel
          title="媒体工具与访问地址"
          description="FFmpeg / ffprobe 缺失会影响缩略图、预览 MP4 和 AI 抽帧；局域网地址用于手机上传。"
          action={<StatusPill tone={ready ? "success" : "warning"}>{ready ? "媒体工具可用" : "需检查"}</StatusPill>}
        >
          <EnvironmentAccessPanel environmentStatus={environmentStatus} accessInfo={accessInfo} />
          <DiagnosticsReportButton />
        </SectionPanel>
      </div>
    </AppShell>
  );
}

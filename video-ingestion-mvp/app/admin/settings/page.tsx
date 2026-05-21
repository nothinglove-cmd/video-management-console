import { Database, FolderTree, HardDrive, Palette, SearchCheck, ServerCog, Settings2, ShieldCheck, Sparkles, Users, Wifi } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { DiagnosticsReportButton } from "@/components/settings/diagnostics-report-button";
import { InfoCard, RiskLegend, SectionPanel, SettingsEntryCard } from "@/components/settings/settings-page-parts";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";
import { getEnvironmentStatus } from "@/lib/admin/environment-status.service";
import { getNetworkAccessInfo } from "@/lib/network/access-info";
import { prisma } from "@/lib/prisma";
import { getStorageRootStatus } from "@/lib/storage/storage-root-config.service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ai = await aiProviderConfigService.getPublicResolvedConfig();
  const environmentStatus = await getEnvironmentStatus();
  const accessInfo = getNetworkAccessInfo();
  const storageRootStatus = await getStorageRootStatus();
  const storageRoot = storageRootStatus.rootPath;
  const [materialCount, categoryCount, shooterCount, missingSearchCount] = await Promise.all([
    prisma.material.count(),
    prisma.category.count({ where: { NOT: { status: "DELETED" } } }).catch(() => 0),
    prisma.shooter.count({ where: { NOT: { status: "DELETED" } } }),
    prisma.material.count({ where: { OR: [{ searchText: null }, { searchText: "" }] } })
  ]);
  const mediaToolsReady = environmentStatus.mediaTools.ffmpeg.available && environmentStatus.mediaTools.ffprobe.available;
  const lanUploadReady = accessInfo.addresses.length > 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings"
        title="设置中心"
        description="设置中心总览只展示关键状态和入口；进入对应设置域后再处理具体配置、巡检或维护动作。"
      />
      <div className="mt-4 space-y-4">
        <SectionPanel
          title="设置入口"
          description="先选择要处理的设置域。每个子页面只显示当前域相关能力，高风险维护动作只进入系统维护。"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <SettingsEntryCard
              title="存储与巡检"
              description="Workspace、存储根目录、栏目目录同步、存储健康扫描和低风险修复。"
              href="/admin/settings/storage"
              tone="warning"
              icon={HardDrive}
            />
            <SettingsEntryCard
              title="AI 识别"
              description="Provider、模型、baseUrl、fallback、密钥状态和连接测试。密钥不回显。"
              href="/admin/settings/ai"
              tone="warning"
              icon={Sparkles}
            />
            <SettingsEntryCard
              title="环境与访问"
              description="FFmpeg / ffprobe 状态、本机地址、局域网手机上传地址和诊断报告。"
              href="/admin/settings/environment"
              tone={lanUploadReady && mediaToolsReady ? "neutral" : "warning"}
              icon={Wifi}
            />
            <SettingsEntryCard
              title="界面与基础配置"
              description="界面皮肤、栏目配置、拍摄人管理和上层中台字段预留。"
              href="/admin/settings/interface"
              tone="info"
              icon={Palette}
            />
            <SettingsEntryCard
              title="系统维护"
              description="系统完全初始化等高风险维护能力。进入前请确认已完成备份。"
              href="/admin/settings/maintenance"
              tone="danger"
              icon={ShieldCheck}
            />
          </div>
        </SectionPanel>

        <RiskLegend compact />

        <SectionPanel
          title="状态摘要"
          description="辅助确认数据规模、存储根目录、AI Provider、媒体工具和手机访问入口。"
          action={<StatusPill tone="neutral">只读摘要</StatusPill>}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="素材记录" value={materialCount} icon={Database} />
            <MetricCard label="栏目配置" value={categoryCount} icon={FolderTree} />
            <MetricCard label="拍摄人" value={shooterCount} icon={Users} />
            <MetricCard label="待补搜索索引" value={missingSearchCount} icon={SearchCheck} tone={missingSearchCount > 0 ? "warning" : "success"} />
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            <InfoCard label="Storage Root" value={storageRoot} icon={HardDrive} />
            <InfoCard label="AI Provider" value={`${ai.provider} / ${ai.model || "未配置 model"}`} icon={Sparkles} />
            <InfoCard label="FFmpeg / ffprobe" value={mediaToolsReady ? "可用" : "需检查"} icon={ServerCog} />
            <InfoCard label="本机后台" value={accessInfo.localhostUrl} icon={ShieldCheck} />
            <InfoCard label="局域网手机上传" value={accessInfo.addresses[0]?.mobileUploadUrl || "未检测到可用局域网 IP"} icon={Wifi} />
            <InfoCard label="Workspace" value="单 workspace" icon={Settings2} />
          </div>
        </SectionPanel>

        <DiagnosticsReportButton />
      </div>
    </AppShell>
  );
}

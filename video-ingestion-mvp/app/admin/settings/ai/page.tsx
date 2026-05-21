import { Sparkles } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { AiProviderConfigPanel } from "@/components/settings/ai-provider-config-panel";
import { InfoCard, SectionPanel, SettingsBackLink } from "@/components/settings/settings-page-parts";
import { StatusPill } from "@/components/ui/status-pill";
import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const ai = await aiProviderConfigService.getPublicResolvedConfig();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Settings / AI"
        title="AI 识别"
        description="管理 provider、模型、baseUrl、fallback 和连接测试；密钥只显示是否配置，不回显完整 key。"
      />
      <div className="mt-4 space-y-4">
        <SettingsBackLink />
        <SectionPanel
          title="当前 AI 配置"
          description="配置保存会影响后续 AI 入库识别，但不会修改已有素材文件本身。"
          action={<StatusPill tone={ai.provider === "mock" ? "neutral" : "info"}>{ai.provider}</StatusPill>}
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Provider / Model" value={`${ai.provider} / ${ai.model || "-"}`} icon={Sparkles} />
            <InfoCard label="Fallback" value={ai.fallbackProvider} />
            <InfoCard label="Base URL" value={ai.baseUrl || ai.volcengineBaseUrl || "未配置"} />
            <InfoCard label="Local AI" value={`${ai.localBaseUrl || "未配置"} / ${ai.localModel || "未配置"}`} />
            <InfoCard label="配置来源" value={ai.source === "db" ? "后台保存配置" : ".env 配置"} />
            <InfoCard label="Key 状态" value={`OpenAI ${ai.openaiApiKeyConfigured ? "已配置" : "未配置"} / Ark ${ai.arkApiKeyConfigured ? "已配置" : "未配置"} / Local ${ai.localApiKeyConfigured ? "已配置" : "未配置"}`} />
            <InfoCard label="请求参数" value={`${ai.frameMax} 张 / ${ai.imageDetail} / ${ai.requestTimeoutMs}ms`} />
            <InfoCard label="Local Healthcheck" value={ai.localHealthcheckUrl || "未配置"} />
          </div>
          <AiProviderConfigPanel />
        </SectionPanel>
      </div>
    </AppShell>
  );
}

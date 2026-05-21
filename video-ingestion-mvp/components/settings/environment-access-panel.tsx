"use client";

import { useState } from "react";
import { Clipboard, Film, Upload, Wifi } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import type { EnvironmentStatus } from "@/lib/admin/environment-status.service";
import type { NetworkAccessInfo } from "@/lib/network/access-info";
import { cn } from "@/lib/utils";

export function EnvironmentAccessPanel({
  environmentStatus,
  accessInfo
}: {
  environmentStatus: EnvironmentStatus;
  accessInfo: NetworkAccessInfo;
}) {
  const [copied, setCopied] = useState("");

  async function copy(value: string, label: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <Surface tone="muted" padding="sm" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Film className="h-4 w-4 text-primary" />
            <p className={skin.typography.sectionTitle}>媒体工具状态</p>
          </div>
          <StatusPill tone={mediaToolsTone(environmentStatus)} withDot>
            {environmentStatus.mediaTools.ffmpeg.available && environmentStatus.mediaTools.ffprobe.available ? "可用" : "需检查"}
          </StatusPill>
        </div>
        <MediaToolRow name="FFmpeg" status={environmentStatus.mediaTools.ffmpeg} />
        <MediaToolRow name="ffprobe" status={environmentStatus.mediaTools.ffprobe} />
        <p className={cn("text-muted-foreground", skin.typography.meta)}>
          FFmpeg / ffprobe 可用时，系统可以读取视频时长和尺寸，并生成缩略图、预览 MP4 与 AI 抽帧；缺失时上传仍可进行，但派生文件可能失败或缺失。
        </p>
      </Surface>

      <Surface tone="muted" padding="sm" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            <p className={skin.typography.sectionTitle}>访问地址</p>
          </div>
          <StatusPill tone={accessInfo.addresses.length > 0 ? "success" : "warning"} withDot>
            端口 {accessInfo.port}
          </StatusPill>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <AccessRow
            label="本机后台"
            value={accessInfo.localhostUrl}
            copied={copied === "本机后台"}
            onCopy={() => copy(accessInfo.localhostUrl, "本机后台")}
          />
          <AccessRow
            label="本机手机上传"
            value={accessInfo.localhostMobileUploadUrl}
            copied={copied === "本机手机上传"}
            onCopy={() => copy(accessInfo.localhostMobileUploadUrl, "本机手机上传")}
          />
          {accessInfo.addresses.map((item) => (
            <AccessRow
              key={`${item.interfaceName}-${item.address}-admin`}
              label={`${item.interfaceName} 局域网后台`}
              value={item.url}
              copied={copied === `${item.interfaceName}-${item.address}-admin`}
              onCopy={() => copy(item.url, `${item.interfaceName}-${item.address}-admin`)}
            />
          ))}
          {accessInfo.addresses.map((item) => (
            <AccessRow
              key={`${item.interfaceName}-${item.address}-upload`}
              label={`${item.interfaceName} 局域网手机上传`}
              value={item.mobileUploadUrl}
              copied={copied === `${item.interfaceName}-${item.address}-upload`}
              onCopy={() => copy(item.mobileUploadUrl, `${item.interfaceName}-${item.address}-upload`)}
            />
          ))}
        </div>
        {accessInfo.addresses.length > 0 ? (
          <p className={cn("text-muted-foreground", skin.typography.meta)}>
            手机和电脑需要在同一 Wi-Fi 或同一手机热点下；多网卡时可逐个尝试上方局域网地址。
          </p>
        ) : (
          <Surface tone="muted" padding="sm" className={cn("border-amber-200 bg-amber-50/70 text-amber-900", skin.typography.meta)}>
            未检测到局域网 IP。请检查 Wi-Fi、手机热点、防火墙设置，并确认 dev server 使用可被局域网访问的监听地址。
          </Surface>
        )}
      </Surface>
    </div>
  );
}

function MediaToolRow({ name, status }: { name: string; status: EnvironmentStatus["mediaTools"]["ffmpeg"] }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0 bg-white/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={skin.typography.label}>{name}</p>
          <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>
            {status.versionLine || status.error || "未检测到"}
          </p>
        </div>
        <StatusPill tone={status.available ? "success" : "warning"}>{status.available ? "可用" : "缺失"}</StatusPill>
      </div>
    </Surface>
  );
}

function AccessRow({
  label,
  value,
  copied,
  onCopy
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0 bg-white/60">
      <div className="flex items-start gap-2">
        <Upload className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className={skin.typography.label}>{label}</p>
          <p className={cn("mt-1 break-all font-medium", skin.typography.path)}>{value}</p>
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
          <Clipboard className="mr-1 h-3.5 w-3.5" />
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </Surface>
  );
}

function mediaToolsTone(status: EnvironmentStatus): SkinStatusTone {
  return status.mediaTools.ffmpeg.available && status.mediaTools.ffprobe.available ? "success" : "warning";
}

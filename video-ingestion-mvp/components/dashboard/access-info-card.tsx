"use client";

import { useState } from "react";
import { Clipboard, Wifi } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { NetworkAccessInfo } from "@/lib/network/access-info";

export function AccessInfoCard({ info }: { info: NetworkAccessInfo }) {
  const [copied, setCopied] = useState("");

  async function copy(value: string, label: string) {
    await navigator.clipboard?.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  return (
    <div className="rounded-lg border bg-slate-50 p-3">
      <div className="flex items-center gap-2">
        <Wifi className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground">访问地址</p>
      </div>
      <div className="mt-3 space-y-2">
        <AccessRow
          label="本机后台"
          value={info.localhostUrl}
          copied={copied === "本机后台"}
          onCopy={() => copy(info.localhostUrl, "本机后台")}
        />
        <AccessRow
          label="本机上传"
          value={info.localhostMobileUploadUrl}
          copied={copied === "本机上传"}
          onCopy={() => copy(info.localhostMobileUploadUrl, "本机上传")}
        />
        {info.addresses.map((item) => (
          <AccessRow
            key={`${item.interfaceName}-${item.address}`}
            label={`${item.interfaceName} 手机上传`}
            value={item.mobileUploadUrl}
            copied={copied === item.mobileUploadUrl}
            onCopy={() => copy(item.mobileUploadUrl, item.mobileUploadUrl)}
          />
        ))}
      </div>
      {info.addresses.length ? (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          手机和电脑需要在同一 Wi-Fi 或同一个手机热点下。连接手机热点时，优先尝试上方出现的 172/10/192.168 开头地址。
        </p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-orange-700">
          暂未检测到局域网 IP。请确认电脑已连接 Wi-Fi 或手机热点，并用 `npm run dev -- -H 0.0.0.0` 启动以允许局域网访问。
        </p>
      )}
    </div>
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
    <div className="rounded-md border bg-white p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 break-all text-xs font-medium">{value}</p>
        <Button type="button" variant="secondary" size="sm" onClick={onCopy}>
          <Clipboard className="mr-1 h-3.5 w-3.5" />
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    </div>
  );
}

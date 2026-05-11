"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { skin } from "@/components/theme/skin";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type ConfigStatus = {
  code: string;
  name: string;
  status: string;
} | null;

type WorkspaceStatus = {
  mode: "single-workspace";
  workspace: ConfigStatus;
  storageProvider: (ConfigStatus & {
    type: string;
    rootPath: string | null;
  }) | null;
  themePreset: ConfigStatus;
  menuConfig: ConfigStatus;
  terminologyPack: ConfigStatus;
  industryTemplate: ConfigStatus;
  missingBindings: Record<string, boolean>;
  hasMissingBindings: boolean;
  nullWorkspaceCounts: {
    category: number;
    material: number;
    importBatch: number;
    ingestionJob: number;
  };
};

export function WorkspaceStatusPanel() {
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/workspace/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<WorkspaceStatus>;
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError((requestError as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nullWorkspaceTotal = useMemo(() => {
    if (!status) return 0;
    return Object.values(status.nullWorkspaceCounts).reduce((sum, value) => sum + value, 0);
  }, [status]);

  return (
    <Panel padding="none" className="overflow-hidden" style={skin.vars}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>工作空间状态</p>
          <p className={cn("mt-1", skin.typography.meta)}>默认工作空间与基础配置绑定</p>
        </div>
        <StatusPill tone={status?.hasMissingBindings ? "warning" : "neutral"} withDot>
          单 workspace
        </StatusPill>
      </div>
      <div className={cn("space-y-3 p-[var(--skin-panel-padding)]", skin.typography.body)}>
        <p className={cn("text-muted-foreground", skin.typography.meta)}>
          第一版为单 workspace 模式，本面板只读展示默认工作空间、存储与配置绑定状态。
        </p>
        {error ? (
          <Surface tone="muted" padding="sm" className="border-red-200 bg-red-50 text-red-700">
            工作空间状态读取失败：{error}
          </Surface>
        ) : null}
        {!status && !error ? (
          <Surface tone="muted" padding="sm" className="text-muted-foreground">正在读取工作空间状态...</Surface>
        ) : null}
        {status ? (
          <>
            {status.hasMissingBindings ? (
              <Warning>
                默认工作空间存在缺失绑定，请检查 storage provider、主题、菜单、术语包或行业模板初始化状态。
              </Warning>
            ) : null}
            {nullWorkspaceTotal > 0 ? (
              <Warning>
                检测到历史数据仍有空 workspaceId：Category {status.nullWorkspaceCounts.category}，Material{" "}
                {status.nullWorkspaceCounts.material}，ImportBatch {status.nullWorkspaceCounts.importBatch}，
                IngestionJob {status.nullWorkspaceCounts.ingestionJob}。本面板不会自动回填。
              </Warning>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Info label="模式" value="单 workspace" />
              <Info label="Workspace" value={formatConfig(status.workspace)} />
              <Info
                label="Storage Provider"
                value={
                  status.storageProvider
                    ? `${status.storageProvider.code} / ${status.storageProvider.name} / ${status.storageProvider.type} / ${status.storageProvider.status}`
                    : "缺失"
                }
              />
              <Info label="Storage Root" value={status.storageProvider?.rootPath || "未配置"} />
              <Info label="ThemePreset" value={formatConfig(status.themePreset)} />
              <Info label="MenuConfig" value={formatConfig(status.menuConfig)} />
              <Info label="TerminologyPack" value={formatConfig(status.terminologyPack)} />
              <Info label="IndustryTemplate" value={formatConfig(status.industryTemplate)} />
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}

function formatConfig(record: ConfigStatus) {
  if (!record) return "缺失";
  return `${record.code} / ${record.name} / ${record.status}`;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{value}</p>
    </Surface>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <Surface tone="muted" padding="sm" className="border-orange-200 bg-orange-50 text-orange-800">
      <div className="mb-1">
        <StatusPill tone="warning">需要检查</StatusPill>
      </div>
      <div className={skin.typography.meta}>{children}</div>
    </Surface>
  );
}

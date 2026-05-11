import { Palette, SlidersHorizontal } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import { cn } from "@/lib/utils";

export function ThemeSkinPanel() {
  const config = getRuntimeAppConfig();
  const activeSkin = config.themeSkins.options.find((option) => option.code === config.themeSkins.activeCode);

  return (
    <Panel padding="none" className="overflow-hidden" style={skin.vars}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] bg-primary/10 text-primary">
            <Palette className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className={cn("font-semibold", skin.typography.value)}>界面皮肤</p>
            <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>当前启用默认专业版，后续接 ThemePreset 后开放切换。</p>
          </div>
        </div>
        <StatusPill tone="success" withDot>
          默认皮肤已启用
        </StatusPill>
      </div>

      <div className="grid gap-3 p-[var(--skin-panel-padding)]">
        <Surface tone="muted" padding="sm" className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={skin.typography.label}>当前皮肤</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusPill tone="info">{activeSkin?.code || config.theme.code}</StatusPill>
              <p className={cn("font-medium", skin.typography.value)}>{activeSkin?.name || config.theme.name}</p>
            </div>
          </div>
          <p className={cn("max-w-xl text-muted-foreground", skin.typography.meta)}>
            {activeSkin?.description || config.theme.description}
          </p>
        </Surface>

        <div className="hidden overflow-hidden rounded-[var(--skin-radius-panel)] border border-[color:var(--skin-border-subtle)] md:block">
          <div className={cn("grid grid-cols-[1.2fr_0.7fr_1fr_0.7fr_1.8fr] gap-3 bg-[color:var(--skin-surface-table-header)] px-3 py-2 font-medium", skin.typography.tableHead)}>
            <span>皮肤</span>
            <span>模式</span>
            <span>色板</span>
            <span>状态</span>
            <span>说明</span>
          </div>
          {config.themeSkins.options.map((option) => (
            <div
              key={option.code}
              className={cn("grid grid-cols-[1.2fr_0.7fr_1fr_0.7fr_1.8fr] items-center gap-3 border-t border-[color:var(--skin-border-subtle)] px-3 py-2", skin.typography.tableCell)}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">{option.name}</p>
                <p className={cn("truncate", skin.typography.meta)}>{option.code}</p>
              </div>
              <span className="text-muted-foreground">{option.mode}</span>
              <Swatches option={option} />
              <StatusPill tone={option.code === config.themeSkins.activeCode ? "success" : option.available ? "info" : "neutral"}>
                {option.code === config.themeSkins.activeCode ? "当前启用" : option.available ? "可用" : "预留"}
              </StatusPill>
              <p className={cn("line-clamp-2 text-muted-foreground", skin.typography.meta)}>{option.description}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2 md:hidden">
          {config.themeSkins.options.map((option) => (
            <Surface key={option.code} tone={option.available ? "raised" : "muted"} padding="sm" className="min-h-20 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("truncate font-semibold", skin.typography.value)}>{option.name}</p>
                  <p className={cn("truncate", skin.typography.meta)}>{option.code} / {option.mode}</p>
                </div>
                <StatusPill tone={option.code === config.themeSkins.activeCode ? "success" : option.available ? "info" : "neutral"}>
                  {option.code === config.themeSkins.activeCode ? "当前" : option.available ? "可用" : "预留"}
                </StatusPill>
              </div>
              <div className="flex items-center gap-2">
                <Swatches option={option} />
                <p className={cn("line-clamp-2 min-w-0 flex-1 text-muted-foreground", skin.typography.meta)}>{option.description}</p>
              </div>
            </Surface>
          ))}
        </div>

        <Surface tone="raised" padding="sm" className="grid gap-3 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <p className={cn("font-semibold", skin.typography.value)}>切换入口预留</p>
          </div>
          <Select defaultValue={config.themeSkins.activeCode} disabled aria-label="选择界面皮肤">
            {config.themeSkins.options.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </Select>
          <Button type="button" variant="secondary" disabled className="min-h-10">
            应用皮肤（后续启用）
          </Button>
          <p className={cn("text-muted-foreground lg:col-span-3", skin.typography.meta)}>
            {config.themeSkins.switching.reason} 后续切换状态将绑定到{" "}
            <span className="font-medium text-foreground">{config.themeSkins.switching.futureStorage}</span>。
          </p>
        </Surface>
      </div>
    </Panel>
  );
}

function Swatches({ option }: { option: ReturnType<typeof getRuntimeAppConfig>["themeSkins"]["options"][number] }) {
  return (
    <div className="flex min-w-20 gap-1.5" aria-label={`${option.name} 色板`}>
      <span className="h-5 w-5 rounded-[var(--skin-radius-sm)] border border-[color:var(--skin-border)]" style={{ backgroundColor: option.preview.page }} />
      <span className="h-5 w-5 rounded-[var(--skin-radius-sm)] border border-[color:var(--skin-border)]" style={{ backgroundColor: option.preview.panel }} />
      <span className="h-5 w-5 rounded-[var(--skin-radius-sm)] border border-[color:var(--skin-border)]" style={{ backgroundColor: option.preview.primary }} />
      <span className="h-5 w-5 rounded-[var(--skin-radius-sm)] border border-[color:var(--skin-border)]" style={{ backgroundColor: option.preview.accent }} />
    </div>
  );
}

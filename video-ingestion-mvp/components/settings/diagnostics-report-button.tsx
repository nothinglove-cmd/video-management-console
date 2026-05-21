"use client";

import { useState } from "react";
import { Download, FileJson } from "lucide-react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export function DiagnosticsReportButton() {
  const [state, setState] = useState<{
    loading: boolean;
    message: string;
    error: string;
  }>({
    loading: false,
    message: "",
    error: "",
  });

  async function downloadReport() {
    setState({ loading: true, message: "", error: "" });
    try {
      const response = await fetch("/api/admin/diagnostics/report", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`导出失败：${response.status}`);
      }

      const blob = await response.blob();
      const filename = getFilename(response.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setState({ loading: false, message: `已生成 ${filename}`, error: "" });
    } catch (error) {
      setState({
        loading: false,
        message: "",
        error: error instanceof Error ? error.message : "导出诊断报告失败。",
      });
    }
  }

  return (
    <Surface tone="muted" padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <FileJson className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className={skin.typography.sectionTitle}>诊断报告</p>
            <p className={cn("mt-1 text-muted-foreground", skin.typography.meta)}>
              导出 JSON，包含本机路径、环境状态、数据库数量、workspace、storage、AI key 是否配置和访问地址；不包含密钥、`.env` 原文、SQLite 文件或素材文件内容。
            </p>
          </div>
        </div>
        <StatusPill tone="neutral">只读动作</StatusPill>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={downloadReport} disabled={state.loading}>
          <Download className="mr-1.5 h-4 w-4" />
          {state.loading ? "正在导出..." : "导出诊断报告"}
        </Button>
        {state.message ? <p className={cn("text-emerald-700", skin.typography.meta)}>{state.message}</p> : null}
        {state.error ? <p className={cn("text-red-700", skin.typography.meta)}>{state.error}</p> : null}
      </div>
    </Surface>
  );
}

function getFilename(disposition: string | null) {
  const fallback = `video-ingestion-diagnostics-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`;
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

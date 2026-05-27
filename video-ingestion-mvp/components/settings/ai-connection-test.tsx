"use client";

import { useState } from "react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | {
      status: "success" | "error";
      message: string;
      diagnostics?: Record<string, unknown>;
      outputText?: string;
    };

export function AiConnectionTest() {
  const [state, setState] = useState<TestState>({ status: "idle" });

  async function testConnection() {
    setState({ status: "testing" });
    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const data = (await response.json()) as {
        ok?: boolean;
        message?: string;
        diagnostics?: Record<string, unknown>;
        outputText?: string;
      };
      setState({
        status: response.ok && data.ok ? "success" : "error",
        message: data.message || (response.ok ? "测试完成。" : "测试失败。"),
        diagnostics: data.diagnostics,
        outputText: data.outputText
      });
    } catch (error) {
      setState({
        status: "error",
        message: `请求测试接口失败：${(error as Error).message}`
      });
    }
  }

  return (
    <Surface tone="muted" padding="sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={skin.typography.sectionTitle}>AI Provider 连接测试</p>
            <StatusPill tone={state.status === "testing" ? "processing" : "neutral"}>
              {state.status === "testing" ? "测试中" : "手动触发"}
            </StatusPill>
          </div>
          <p className={cn("mt-1", skin.typography.meta)}>
            OpenAI、火山方舟和 OpenAI-compatible 中转站会发送测试图片；Ollama 只做本地 healthcheck。
          </p>
        </div>
        <Button onClick={testConnection} disabled={state.status === "testing"} className="min-h-10">
          {state.status === "testing" ? "测试中..." : "测试 AI 连接"}
        </Button>
      </div>

      {state.status !== "idle" && state.status !== "testing" ? (
        <Surface
          tone="muted"
          padding="sm"
          className={
            state.status === "success"
              ? cn("mt-3 border-emerald-200 bg-emerald-50 text-emerald-800", skin.typography.bodyDense)
              : cn("mt-3 border-red-200 bg-red-50 text-red-800", skin.typography.bodyDense)
          }
        >
          <StatusPill tone={state.status === "success" ? "success" : "danger"}>{state.status === "success" ? "测试成功" : "测试失败"}</StatusPill>
          <p className="mt-1 break-all">{state.message}</p>
          <p className={cn("mt-1", skin.typography.meta)}>
            真实视觉 provider 会发送一张 64x64 测试图片，用于验证图片输入和结构化输出能力。
          </p>
          {state.diagnostics ? (
            <pre className={cn("mt-2 max-h-52 overflow-auto rounded-md bg-white/70 p-2 text-slate-700", skin.textDensity.metadata)}>
              {JSON.stringify(state.diagnostics, null, 2)}
            </pre>
          ) : null}
        </Surface>
      ) : null}
    </Surface>
  );
}

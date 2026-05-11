import type { AiProvider } from "@/lib/config";

type LocalHealthcheckConfig = {
  provider: Extract<AiProvider, "local_openai_compatible" | "local_ollama">;
  baseUrl: string;
  apiKey: string;
  model: string;
  healthcheckUrl: string;
  timeoutMs: number;
};

type LocalHealthcheckResult = {
  ok: boolean;
  provider: LocalHealthcheckConfig["provider"];
  model: string;
  message: string;
  warning?: string;
  diagnostics: Record<string, unknown>;
};

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class LocalHealthcheckService {
  async testLocalOpenAiCompatible(config: Omit<LocalHealthcheckConfig, "provider">): Promise<LocalHealthcheckResult> {
    const provider = "local_openai_compatible" as const;
    const healthcheckUrl = config.healthcheckUrl || (config.baseUrl ? `${trimTrailingSlash(config.baseUrl)}/models` : "");
    if (!config.baseUrl && !config.healthcheckUrl) {
      return this.missingBaseUrl(provider, config, "请配置 LOCAL_AI_BASE_URL、AI_BASE_URL 或 LOCAL_AI_HEALTHCHECK_URL。");
    }

    return this.getHealthcheck({
      provider,
      ...config,
      healthcheckUrl,
      parseResponse: async (response) => {
        if (config.healthcheckUrl) return { modelCount: null };
        try {
          const parsed = (await response.json()) as { data?: unknown; models?: unknown };
          const list = Array.isArray(parsed.data) ? parsed.data : Array.isArray(parsed.models) ? parsed.models : null;
          if (!list) return { invalid: true };
          return { modelCount: list.length };
        } catch {
          return { invalid: true };
        }
      }
    });
  }

  async testLocalOllama(config: Omit<LocalHealthcheckConfig, "provider" | "baseUrl"> & { baseUrl?: string }): Promise<LocalHealthcheckResult> {
    const provider = "local_ollama" as const;
    const baseUrl = config.baseUrl || DEFAULT_OLLAMA_BASE_URL;
    const healthcheckUrl = config.healthcheckUrl || `${trimTrailingSlash(baseUrl)}/api/tags`;
    return this.getHealthcheck({
      provider,
      ...config,
      baseUrl,
      healthcheckUrl,
      parseResponse: async (response) => {
        if (config.healthcheckUrl) return { models: [], modelCount: null };
        try {
          const parsed = (await response.json()) as { models?: Array<{ name?: unknown; model?: unknown }> };
          if (!Array.isArray(parsed.models)) return { invalid: true };
          const models = parsed.models
            .map((item) => String(item.name || item.model || ""))
            .filter(Boolean);
          return { models, modelCount: models.length };
        } catch {
          return { invalid: true };
        }
      }
    });
  }

  private async getHealthcheck(params: LocalHealthcheckConfig & {
    parseResponse: (response: Response) => Promise<{ invalid?: boolean; models?: string[]; modelCount?: number | null }>;
  }): Promise<LocalHealthcheckResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

    try {
      const response = await fetch(params.healthcheckUrl, {
        method: "GET",
        headers: params.apiKey ? { Authorization: `Bearer ${params.apiKey}` } : undefined,
        signal: controller.signal
      });
      const durationMs = Date.now() - startedAt;
      if (!response.ok) {
        return this.failure(params, {
          message: `本地 provider healthcheck 返回 HTTP ${response.status}。`,
          errorType: "http_error",
          status: response.status,
          durationMs
        });
      }

      const parsed = await params.parseResponse(response);
      if (parsed.invalid) {
        return this.failure(params, {
          message: "本地 provider healthcheck 响应格式无法识别。",
          errorType: "invalid_response",
          status: response.status,
          durationMs
        });
      }

      const warning =
        params.provider === "local_ollama" &&
        params.model &&
        parsed.models &&
        !parsed.models.includes(params.model)
          ? "model_not_found"
          : undefined;

      return {
        ok: true,
        provider: params.provider,
        model: params.model || "",
        message: warning
          ? `本地 provider 服务可达，但未在模型列表中找到 ${params.model}。`
          : "本地 provider healthcheck 通过。注意：这只检查服务连通，不代表已启用本地视觉识别。",
        warning,
        diagnostics: this.baseDiagnostics(params, {
          status: response.status,
          durationMs,
          errorType: warning,
          modelCount: parsed.modelCount ?? null,
          models: parsed.models?.slice(0, 20) ?? undefined
        })
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const aborted = (error as Error).name === "AbortError";
      return this.failure(params, {
        message: aborted ? `本地 provider healthcheck 超过 ${params.timeoutMs}ms 未响应。` : `本地 provider healthcheck 连接失败：${errorMessage(error)}`,
        errorType: aborted ? "request_timeout" : "connection_failed",
        durationMs
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private missingBaseUrl(provider: LocalHealthcheckConfig["provider"], config: Omit<LocalHealthcheckConfig, "provider">, message: string): LocalHealthcheckResult {
    return {
      ok: false,
      provider,
      model: config.model || "",
      message,
      diagnostics: this.baseDiagnostics({ provider, ...config }, { errorType: "missing_base_url" })
    };
  }

  private failure(
    params: LocalHealthcheckConfig,
    detail: { message: string; errorType: string; status?: number; durationMs?: number }
  ): LocalHealthcheckResult {
    return {
      ok: false,
      provider: params.provider,
      model: params.model || "",
      message: detail.message,
      diagnostics: this.baseDiagnostics(params, detail)
    };
  }

  private baseDiagnostics(
    params: LocalHealthcheckConfig,
    extra: Record<string, unknown> = {}
  ) {
    return {
      requestedProvider: params.provider,
      actualProvider: params.provider,
      provider: params.provider,
      baseUrl: params.baseUrl || "",
      model: params.model || "",
      apiKeyConfigured: Boolean(params.apiKey),
      healthcheckUrl: params.healthcheckUrl || "",
      timeoutMs: params.timeoutMs,
      localVisionEnabled: false,
      note: "本地 healthcheck 只检查服务连通，不发送图片，不调用识别接口，不代表已启用本地视觉识别。",
      ...extra
    };
  }
}

export const localHealthcheckService = new LocalHealthcheckService();

import type { AIProviderConfig, PrismaClient } from "@prisma/client";

import {
  AI_IMAGE_DETAIL_OPTIONS,
  AI_PROVIDER_OPTIONS,
  type AiConfig,
  type AiImageDetail,
  type AiProvider,
  getAiConfig
} from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { getDefaultWorkspaceContext } from "@/lib/workspace/default-workspace.service";

type AiProviderConfigInput = {
  name?: unknown;
  provider?: unknown;
  model?: unknown;
  baseUrl?: unknown;
  openaiApiKey?: unknown;
  arkApiKey?: unknown;
  volcengineBaseUrl?: unknown;
  localBaseUrl?: unknown;
  localApiKey?: unknown;
  localModel?: unknown;
  localHealthcheckUrl?: unknown;
  fallbackProvider?: unknown;
  frameMax?: unknown;
  imageDetail?: unknown;
  requestTimeoutMs?: unknown;
  openaiProxyUrl?: unknown;
  volcengineProxyUrl?: unknown;
  clearOpenaiApiKey?: unknown;
  clearArkApiKey?: unknown;
  clearLocalApiKey?: unknown;
  activate?: unknown;
};

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

type PersistedConfigData = {
  name: string;
  provider: string;
  model?: string | null;
  baseUrl?: string | null;
  openaiApiKey?: string | null;
  arkApiKey?: string | null;
  volcengineBaseUrl?: string | null;
  localBaseUrl?: string | null;
  localApiKey?: string | null;
  localModel?: string | null;
  localHealthcheckUrl?: string | null;
  fallbackProvider: string;
  frameMax: number;
  imageDetail: string;
  requestTimeoutMs: number;
  openaiProxyUrl?: string | null;
  volcengineProxyUrl?: string | null;
};

export type ResolvedAiConfig = {
  config: AiConfig;
  source: "db" | "env";
  dbConfigId?: string;
  dbConfigName?: string;
};

function trimOptional(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || null;
}

function trimRequired(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.trim() || fallback;
}

function trimSecret(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeProvider(value: unknown, fallback: AiProvider): AiProvider {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase() as AiProvider;
  return AI_PROVIDER_OPTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeImageDetail(value: unknown, fallback: AiImageDetail): AiImageDetail {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase() as AiImageDetail;
  return AI_IMAGE_DETAIL_OPTIONS.includes(normalized) ? normalized : fallback;
}

function normalizeFrameMax(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(8, Math.max(1, Math.floor(parsed)));
}

function normalizeTimeout(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(180_000, Math.max(5_000, Math.floor(parsed)));
}

function pickText(dbValue: string | null | undefined, envValue: string) {
  const trimmed = dbValue?.trim();
  return trimmed || envValue;
}

function defaultConfigName(provider: AiProvider) {
  const labels: Record<AiProvider, string> = {
    mock: "Mock 本地兜底",
    openai: "OpenAI",
    volcengine: "火山方舟",
    local: "Local 旧占位",
    local_openai_compatible: "本地 OpenAI-compatible",
    local_ollama: "Ollama"
  };
  return labels[provider] || provider;
}

export class AiProviderConfigService {
  async getActiveDbConfig(client: DbClient = prisma) {
    const explicitActive = await client.aIProviderConfig.findFirst({
      where: { status: "ACTIVE", isActive: true },
      orderBy: { updatedAt: "desc" }
    });
    if (explicitActive) return explicitActive;

    return client.aIProviderConfig.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" }
    });
  }

  async getConfigById(id: string, client: DbClient = prisma) {
    return client.aIProviderConfig.findFirst({
      where: {
        id,
        status: "ACTIVE"
      }
    });
  }

  async listConfigs(client: DbClient = prisma) {
    return client.aIProviderConfig.findMany({
      where: { status: "ACTIVE" },
      orderBy: [
        { isActive: "desc" },
        { updatedAt: "desc" }
      ]
    });
  }

  async getResolvedConfig(options: { configId?: string } = {}): Promise<ResolvedAiConfig> {
    const envConfig = getAiConfig();
    const dbConfig = options.configId
      ? await this.getConfigById(options.configId)
      : await this.getActiveDbConfig();
    if (options.configId && !dbConfig) {
      throw new Error("指定的 AI Provider 配置不存在或已删除。");
    }
    if (!dbConfig) {
      return { config: envConfig, source: "env" };
    }

    return {
      config: this.mergeConfig(dbConfig, envConfig),
      source: "db",
      dbConfigId: dbConfig.id,
      dbConfigName: dbConfig.name
    };
  }

  async getPublicResolvedConfig() {
    const resolved = await this.getResolvedConfig();
    return this.toPublicCurrentConfig(resolved);
  }

  async getConfigOverview() {
    const resolved = await this.getResolvedConfig();
    const configs = await this.listConfigs();
    const currentConfig = this.toPublicCurrentConfig(resolved);
    return {
      ...currentConfig,
      currentConfig,
      configs: configs.map((config) => this.toPublicDbConfig(config))
    };
  }

  async createConfig(input: AiProviderConfigInput) {
    const envConfig = getAiConfig();
    const workspaceContext = await getDefaultWorkspaceContext();
    const data = this.toPersistedData(input, null, envConfig);
    const shouldActivate = Boolean(input.activate);

    const saved = await prisma.$transaction(async (tx) => {
      const created = await tx.aIProviderConfig.create({
        data: {
          workspaceId: workspaceContext.workspaceId,
          isActive: false,
          ...data
        }
      });
      if (!shouldActivate) return created;
      return this.activateConfigInTransaction(tx, created.id);
    });

    return this.getConfigOverviewWithCurrent(saved.id);
  }

  async updateConfig(id: string, input: AiProviderConfigInput) {
    const envConfig = getAiConfig();
    const current = await this.getConfigById(id);
    if (!current) throw new Error("AI Provider 配置不存在或已删除。");
    const data = this.toPersistedData(input, current, envConfig);
    const shouldActivate = Boolean(input.activate);

    const saved = await prisma.$transaction(async (tx) => {
      await tx.aIProviderConfig.update({
        where: { id },
        data
      });
      if (!shouldActivate) {
        const updated = await tx.aIProviderConfig.findUnique({ where: { id } });
        if (!updated) throw new Error("AI Provider 配置不存在。");
        return updated;
      }
      return this.activateConfigInTransaction(tx, id);
    });

    return this.getConfigOverviewWithCurrent(saved.id);
  }

  async saveConfig(input: AiProviderConfigInput) {
    const current = await this.getActiveDbConfig();
    if (current) return this.updateConfig(current.id, input);
    return this.createConfig({ ...input, activate: true });
  }

  async activateConfig(id: string) {
    const saved = await prisma.$transaction(async (tx) => this.activateConfigInTransaction(tx, id));
    return this.getConfigOverviewWithCurrent(saved.id);
  }

  async deleteConfig(id: string) {
    const config = await this.getConfigById(id);
    if (!config) throw new Error("AI Provider 配置不存在或已删除。");
    const activeConfig = await this.getActiveDbConfig();
    if (config.isActive || activeConfig?.id === config.id) {
      throw new Error("当前启用的 AI Provider 配置不能删除，请先切换到其他配置。");
    }

    await prisma.aIProviderConfig.update({
      where: { id },
      data: {
        status: "DELETED",
        isActive: false
      }
    });
    return this.getConfigOverview();
  }

  async getPublicConfigById(id: string) {
    const config = await this.getConfigById(id);
    if (!config) throw new Error("AI Provider 配置不存在或已删除。");
    return this.toPublicDbConfig(config);
  }

  private async activateConfigInTransaction(client: DbClient, id: string) {
    const target = await client.aIProviderConfig.findFirst({
      where: {
        id,
        status: "ACTIVE"
      }
    });
    if (!target) throw new Error("AI Provider 配置不存在或已删除。");

    await client.aIProviderConfig.updateMany({
      where: {
        workspaceId: target.workspaceId,
        status: "ACTIVE",
        NOT: { id: target.id }
      },
      data: { isActive: false }
    });

    return client.aIProviderConfig.update({
      where: { id: target.id },
      data: { isActive: true }
    });
  }

  private async getConfigOverviewWithCurrent(configId: string) {
    const resolved = await this.getResolvedConfig({ configId });
    const configs = await this.listConfigs();
    const currentConfig = this.toPublicCurrentConfig(resolved);
    return {
      ...currentConfig,
      currentConfig,
      configs: configs.map((config) => this.toPublicDbConfig(config))
    };
  }

  private mergeConfig(dbConfig: AIProviderConfig, envConfig: AiConfig): AiConfig {
    const provider = normalizeProvider(dbConfig.provider, envConfig.provider);
    const fallbackProvider = normalizeProvider(dbConfig.fallbackProvider, envConfig.fallbackProvider);
    const imageDetail = normalizeImageDetail(dbConfig.imageDetail, envConfig.imageDetail);
    const frameMax = normalizeFrameMax(dbConfig.frameMax, envConfig.frameMax);
    const requestTimeoutMs = normalizeTimeout(dbConfig.requestTimeoutMs, envConfig.requestTimeoutMs);

    return {
      provider,
      model: pickText(dbConfig.model, envConfig.model),
      baseUrl: pickText(dbConfig.baseUrl, envConfig.baseUrl),
      openaiApiKey: pickText(dbConfig.openaiApiKey, envConfig.openaiApiKey),
      arkApiKey: pickText(dbConfig.arkApiKey, envConfig.arkApiKey),
      volcengineBaseUrl: pickText(dbConfig.volcengineBaseUrl, envConfig.volcengineBaseUrl),
      localBaseUrl: pickText(dbConfig.localBaseUrl, envConfig.localBaseUrl),
      localApiKey: pickText(dbConfig.localApiKey, envConfig.localApiKey),
      localModel: pickText(dbConfig.localModel, envConfig.localModel),
      localHealthcheckUrl: pickText(dbConfig.localHealthcheckUrl, envConfig.localHealthcheckUrl),
      fallbackProvider,
      frameMax,
      imageDetail,
      requestTimeoutMs,
      openaiProxyUrl: pickText(dbConfig.openaiProxyUrl, envConfig.openaiProxyUrl),
      volcengineProxyUrl: pickText(dbConfig.volcengineProxyUrl, envConfig.volcengineProxyUrl)
    };
  }

  private toPersistedData(input: AiProviderConfigInput, current: AIProviderConfig | null, envConfig: AiConfig): PersistedConfigData {
    const provider = normalizeProvider(input.provider, current ? normalizeProvider(current.provider, envConfig.provider) : envConfig.provider);
    const data: PersistedConfigData = {
      name: trimRequired(input.name, current?.name || defaultConfigName(provider)),
      provider,
      fallbackProvider: normalizeProvider(
        input.fallbackProvider,
        current ? normalizeProvider(current.fallbackProvider, envConfig.fallbackProvider) : envConfig.fallbackProvider
      ),
      imageDetail: normalizeImageDetail(input.imageDetail, current ? normalizeImageDetail(current.imageDetail, envConfig.imageDetail) : envConfig.imageDetail),
      frameMax: normalizeFrameMax(input.frameMax, current?.frameMax ?? envConfig.frameMax),
      requestTimeoutMs: normalizeTimeout(input.requestTimeoutMs, current?.requestTimeoutMs ?? envConfig.requestTimeoutMs)
    };

    for (const field of [
      "model",
      "baseUrl",
      "volcengineBaseUrl",
      "localBaseUrl",
      "localModel",
      "localHealthcheckUrl",
      "openaiProxyUrl",
      "volcengineProxyUrl"
    ] as const) {
      if (field in input) data[field] = trimOptional(input[field]);
    }

    if (input.clearOpenaiApiKey) data.openaiApiKey = null;
    else if (trimSecret(input.openaiApiKey)) data.openaiApiKey = trimSecret(input.openaiApiKey);

    if (input.clearArkApiKey) data.arkApiKey = null;
    else if (trimSecret(input.arkApiKey)) data.arkApiKey = trimSecret(input.arkApiKey);

    if (input.clearLocalApiKey) data.localApiKey = null;
    else if (trimSecret(input.localApiKey)) data.localApiKey = trimSecret(input.localApiKey);

    return data;
  }

  private toPublicCurrentConfig(resolved: ResolvedAiConfig) {
    const config = resolved.config;
    return {
      source: resolved.source,
      dbConfigId: resolved.dbConfigId ?? null,
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
      volcengineBaseUrl: config.volcengineBaseUrl,
      localBaseUrl: config.localBaseUrl,
      localModel: config.localModel,
      localHealthcheckUrl: config.localHealthcheckUrl,
      fallbackProvider: config.fallbackProvider,
      frameMax: config.frameMax,
      imageDetail: config.imageDetail,
      requestTimeoutMs: config.requestTimeoutMs,
      openaiProxyUrl: config.openaiProxyUrl,
      volcengineProxyUrl: config.volcengineProxyUrl,
      openaiApiKeyConfigured: Boolean(config.openaiApiKey),
      arkApiKeyConfigured: Boolean(config.arkApiKey),
      localApiKeyConfigured: Boolean(config.localApiKey)
    };
  }

  private toPublicDbConfig(config: AIProviderConfig) {
    return {
      id: config.id,
      workspaceId: config.workspaceId,
      name: config.name,
      provider: normalizeProvider(config.provider, "mock"),
      model: config.model || "",
      baseUrl: config.baseUrl || "",
      volcengineBaseUrl: config.volcengineBaseUrl || "",
      localBaseUrl: config.localBaseUrl || "",
      localModel: config.localModel || "",
      localHealthcheckUrl: config.localHealthcheckUrl || "",
      fallbackProvider: normalizeProvider(config.fallbackProvider, "mock"),
      frameMax: config.frameMax,
      imageDetail: normalizeImageDetail(config.imageDetail, "low"),
      requestTimeoutMs: config.requestTimeoutMs,
      openaiProxyUrl: config.openaiProxyUrl || "",
      volcengineProxyUrl: config.volcengineProxyUrl || "",
      openaiApiKeyConfigured: Boolean(config.openaiApiKey),
      arkApiKeyConfigured: Boolean(config.arkApiKey),
      localApiKeyConfigured: Boolean(config.localApiKey),
      isActive: config.isActive,
      status: config.status,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString()
    };
  }
}

export const aiProviderConfigService = new AiProviderConfigService();

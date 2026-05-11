import { Prisma, type AIProviderType, type Material } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { ClassifierResult, RuntimeProvider } from "@/modules/ai/material-classifier.service";

function toAiProviderType(provider: RuntimeProvider | null | undefined): AIProviderType | null {
  if (!provider) return null;
  if (provider === "mock") return "MOCK";
  if (provider === "openai") return "OPENAI";
  if (provider === "volcengine") return "VOLCENGINE";
  if (provider === "local_openai_compatible") return "LOCAL_OPENAI_COMPATIBLE";
  if (provider === "local_ollama") return "LOCAL_OLLAMA";
  if (provider === "local") return "OTHER";
  return "OTHER";
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  if (value === undefined) return {};
  return value as Prisma.InputJsonValue;
}

export class AiAnalysisJobService {
  async createForClassifierResult(params: {
    material: Material;
    ai: ClassifierResult;
    inputFramePaths: string[];
    inputMetadata?: Record<string, unknown>;
    outputResult: unknown;
    startedAt?: Date;
    completedAt?: Date;
    status?: "SUCCEEDED" | "FAILED";
  }) {
    const durationMs = params.ai.durationMs ?? 0;
    const completedAt = params.completedAt ?? new Date();
    const startedAt = params.startedAt ?? new Date(completedAt.getTime() - durationMs);
    const providerType = toAiProviderType(params.ai.requestedProvider) ?? "OTHER";
    const fallbackProviderType = params.ai.usedFallback
      ? toAiProviderType(params.ai.fallbackProvider ?? params.ai.actualProvider)
      : null;
    const status = params.status ?? (params.ai.classification ? "SUCCEEDED" : "FAILED");

    return prisma.aIAnalysisJob.create({
      data: {
        workspaceId: params.material.workspaceId,
        materialId: params.material.materialId,
        providerType,
        providerName: params.ai.requestedProvider,
        modelName: params.ai.modelName,
        status,
        inputFramePaths: toJsonValue(params.inputFramePaths),
        inputMetadata: toJsonValue({
          ...(params.inputMetadata ?? {}),
          requestedProvider: params.ai.requestedProvider,
          actualProvider: params.ai.actualProvider ?? params.ai.provider,
          modelName: params.ai.modelName ?? null,
          usedFallback: params.ai.usedFallback,
          fallbackProvider: params.ai.fallbackProvider ?? null,
          diagnostics: params.ai.diagnostics ?? null
        }),
        outputResult: toJsonValue(params.outputResult),
        fallbackProviderType,
        usedFallback: params.ai.usedFallback,
        confidence: params.ai.classification.confidence ?? null,
        durationMs,
        errorCode: params.ai.diagnostics?.errorType ?? null,
        errorMessage: params.ai.errorMessage ?? null,
        startedAt,
        completedAt
      }
    });
  }
}

export const aiAnalysisJobService = new AiAnalysisJobService();

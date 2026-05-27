import os from "node:os";
import path from "node:path";

export type AiProvider = "mock" | "openai" | "volcengine" | "local" | "local_openai_compatible" | "local_ollama";
export type AiImageDetail = "low" | "auto" | "high";
export const AI_PROVIDER_OPTIONS: AiProvider[] = [
  "mock",
  "openai",
  "volcengine",
  "local",
  "local_openai_compatible",
  "local_ollama"
];
export const AI_IMAGE_DETAIL_OPTIONS: AiImageDetail[] = ["low", "auto", "high"];

export function getStorageRoot() {
  return path.resolve(
    process.env.STORAGE_ROOT?.trim() || path.join(os.homedir(), "VideoIngestionStorage")
  );
}

export function getAiConfig() {
  const provider = (process.env.AI_PROVIDER || "mock").toLowerCase() as AiProvider;
  const fallbackProvider = (process.env.AI_FALLBACK_PROVIDER || "mock").toLowerCase() as AiProvider;
  const imageDetail = (process.env.AI_IMAGE_DETAIL || "low").toLowerCase() as AiImageDetail;
  const frameMax = Number(process.env.AI_FRAME_MAX || 5);
  const requestTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60_000);

  return {
    provider: AI_PROVIDER_OPTIONS.includes(provider) ? provider : "mock",
    model: process.env.AI_MODEL?.trim() || "gpt-4.1-mini",
    baseUrl: process.env.AI_BASE_URL?.trim() || "",
    openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
    arkApiKey: process.env.ARK_API_KEY?.trim() || "",
    volcengineBaseUrl: process.env.VOLCENGINE_BASE_URL?.trim() || "https://ark.cn-beijing.volces.com/api/v3",
    localBaseUrl: process.env.LOCAL_AI_BASE_URL?.trim() || process.env.AI_BASE_URL?.trim() || "",
    localApiKey: process.env.LOCAL_AI_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || "",
    localModel: process.env.LOCAL_AI_MODEL?.trim() || process.env.AI_MODEL?.trim() || "",
    localHealthcheckUrl: process.env.LOCAL_AI_HEALTHCHECK_URL?.trim() || "",
    fallbackProvider: AI_PROVIDER_OPTIONS.includes(fallbackProvider) ? fallbackProvider : "mock",
    frameMax: Number.isFinite(frameMax) ? Math.min(8, Math.max(1, Math.floor(frameMax))) : 5,
    imageDetail: AI_IMAGE_DETAIL_OPTIONS.includes(imageDetail) ? imageDetail : "low",
    requestTimeoutMs: Number.isFinite(requestTimeoutMs)
      ? Math.min(180_000, Math.max(5_000, Math.floor(requestTimeoutMs)))
      : 60_000,
    openaiProxyUrl: process.env.OPENAI_PROXY_URL?.trim() || "",
    volcengineProxyUrl: process.env.VOLCENGINE_PROXY_URL?.trim() || process.env.OPENAI_PROXY_URL?.trim() || ""
  };
}

export type AiConfig = ReturnType<typeof getAiConfig>;

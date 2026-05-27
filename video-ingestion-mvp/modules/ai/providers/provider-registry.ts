import type { AiProvider } from "@/lib/config";
import type { RuntimeProvider } from "@/modules/ai/material-classifier.service";

export function isOpenAiCompatibleProvider(provider: AiProvider): provider is "openai" | "volcengine" | "local_openai_compatible" {
  return provider === "openai" || provider === "volcengine" || provider === "local_openai_compatible";
}

export function isReservedLocalProvider(provider: AiProvider): provider is "local" | "local_ollama" {
  return provider === "local" || provider === "local_ollama";
}

export function isLocalOllamaProvider(provider: AiProvider): provider is "local_ollama" {
  return provider === "local_ollama";
}

export function toRuntimeProvider(provider: AiProvider): RuntimeProvider {
  if (provider === "local_openai_compatible" || provider === "local_ollama") return provider;
  return provider;
}

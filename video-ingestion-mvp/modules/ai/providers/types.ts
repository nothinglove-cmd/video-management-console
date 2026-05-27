import type {
  AiClassification,
  AiRunDiagnostics,
  ClassifierContext,
  ClassifierResult,
  RuntimeProvider
} from "@/modules/ai/material-classifier.service";

export type ProviderClassifyInput = {
  frames: string[];
  context: ClassifierContext;
};

export type ProviderClassifyResult = ClassifierResult;

export type AiProviderAdapter = {
  provider: RuntimeProvider;
  classify(input: ProviderClassifyInput): Promise<ProviderClassifyResult>;
};

export type ClassificationValidationResult = {
  classification: AiClassification;
  warnings: string[];
};

export type LocalizedClassificationResult = {
  classification: AiClassification;
  changed: boolean;
  stillEnglish: boolean;
};

export type OpenAiCompatibleProviderConfig = {
  provider: "openai" | "volcengine" | "local_openai_compatible";
  model: string;
  apiKey: string;
  baseUrl: string;
  frameMax: number;
  imageDetail: AiRunDiagnostics["imageDetail"];
  requestTimeoutMs: number;
  proxyUrl?: string;
  buildPrompt: (context: ClassifierContext) => string;
  outputJsonSchema: (noNullableUnion?: boolean) => Record<string, unknown>;
  validateClassification: (value: unknown, fallbackReason: string) => ClassificationValidationResult;
  localizeClassificationText: (classification: AiClassification) => LocalizedClassificationResult;
};

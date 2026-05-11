import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import sharp from "sharp";
import { z } from "zod";

import { aiProviderConfigService } from "@/lib/ai/ai-provider-config.service";
import { type AiImageDetail } from "@/lib/config";
import { UNSORTED_DIR } from "@/lib/storage/storage.constants";
import { mockProvider } from "@/modules/ai/providers/mock.provider";
import { localHealthcheckService } from "@/modules/ai/providers/local-healthcheck.service";
import { openAiCompatibleProvider, summarizeOpenAiError } from "@/modules/ai/providers/openai-compatible.provider";
import {
  isLocalOllamaProvider,
  isLocalOpenAiCompatibleProvider,
  isOpenAiCompatibleProvider,
  isReservedLocalProvider,
  toRuntimeProvider
} from "@/modules/ai/providers/provider-registry";

export type RuntimeProvider = "mock" | "openai" | "volcengine" | "local" | "local_openai_compatible" | "local_ollama";

export const AiClassificationSchema = z
  .object({
    assetType: z.enum(["ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE", "UNKNOWN"]),
    primaryCategory: z.string().min(1),
    aiSuggestedRootCategory: z.string().optional().default(""),
    aiSuggestedSubCategory: z.string().optional().default(""),
    suggestedCategoryId: z.string().optional().default(""),
    subjectType: z.enum(["PERSON", "ANIMAL", "LANDSCAPE", "PRODUCT", "OBJECT", "EVENT", "UNKNOWN"]).optional().default("UNKNOWN"),
    subject: z.string().optional().nullable(),
    scene: z.string().optional().nullable(),
    action: z.string().optional().nullable(),
    usage: z.string().optional().nullable(),
    productName: z.string().optional().nullable(),
    platform: z.string().optional().nullable(),
    referenceType: z.string().optional().nullable(),
    hookType: z.string().optional().nullable(),
    emotionTags: z.array(z.string()).optional().default([]),
    usageTags: z.array(z.string()).optional().default([]),
    visualTags: z.array(z.string()).optional().default([]),
    sceneTags: z.array(z.string()).optional().default([]),
    subjectTags: z.array(z.string()).optional().default([]),
    actionTags: z.array(z.string()).optional().default([]),
    contentIntent: z.enum(["DAILY_CONTENT", "HOOK", "TOPIC", "PRODUCT_SUPPORT", "REFERENCE", "TEST", "UNKNOWN"]).optional().default("UNKNOWN"),
    contentLongevity: z.enum(["ONE_OFF", "SEASONAL", "LONG_TERM", "UNKNOWN"]).optional().default("UNKNOWN"),
    topicSuggestion: z.string().optional().default(""),
    topicName: z.string().optional().default(""),
    contentTags: z.array(z.string()).optional().default([]),
    painPointTags: z.array(z.string()).optional().default([]),
    structureTags: z.array(z.string()).optional().default([]),
    conversionStage: z.string().optional().nullable(),
    mainTakeaway: z.string().optional().nullable(),
    summary: z.string().min(1),
    conflictReason: z.string().optional().default(""),
    suggestedFileNameParts: z
      .object({
        uploaderName: z.string().optional().nullable(),
        subject: z.string().optional().nullable(),
        productName: z.string().optional().nullable(),
        actionScene: z.string().optional().nullable(),
        usage: z.string().optional().nullable(),
        platform: z.string().optional().nullable(),
        referenceType: z.string().optional().nullable(),
        hookType: z.string().optional().nullable()
      })
      .optional()
      .default({}),
    confidence: z.number().min(0).max(1),
    needsHumanReview: z.boolean().optional().default(true)
  })
  .passthrough();

export type AiClassification = z.input<typeof AiClassificationSchema>;

export type ClassifierContext = {
  originalFileName: string;
  uploaderName?: string | null;
  shooterName?: string | null;
  userSelectedRootCategory?: string | null;
  userSelectedSubCategory?: string | null;
  customTags?: string[];
  notes?: string | null;
  manualAssetType?: "AUTO" | "ACCOUNT_MATERIAL" | "PRODUCT_MATERIAL" | "REFERENCE_VIDEO" | "PUBLIC_RESOURCE";
  fileSize: number;
  mimeType?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  orientation?: string | null;
  categoryOptions?: Array<{
    id: string;
    name: string;
    relativePath: string;
    assetType: string;
    aiDescription?: string | null;
  }>;
};

export type ClassifierResult = {
  classification: AiClassification;
  provider: RuntimeProvider;
  requestedProvider: RuntimeProvider;
  actualProvider?: RuntimeProvider;
  modelName?: string;
  usedFallback: boolean;
  fallbackProvider?: RuntimeProvider | null;
  durationMs?: number;
  errorMessage?: string | null;
  warnings: string[];
  diagnostics?: AiRunDiagnostics;
  raw?: unknown;
};

export type AiRunDiagnostics = {
  requestedProvider: RuntimeProvider;
  actualProvider: RuntimeProvider;
  provider: RuntimeProvider;
  model?: string;
  baseUrl?: string;
  frameCount?: number;
  sentFrameCount?: number;
  imageDetail?: AiImageDetail;
  timeoutMs?: number;
  proxyEnabled?: boolean;
  requestId?: string | null;
  status?: number | null;
  fallbackUsed: boolean;
  errorSummary?: string;
  errorType?: string;
  note?: string;
};

export type OpenAiRequestConfig = {
  provider: "openai" | "volcengine";
  model: string;
  apiKey: string;
  baseUrl: string;
  frameMax: number;
  imageDetail: AiImageDetail;
  requestTimeoutMs: number;
  proxyUrl?: string;
};

const MOCK_KEYWORDS = {
  reference: ["对标", "抖音", "快手", "爆款", "参考", "竞品", "ref"],
  product: ["产品", "丝兰", "痛点", "口播", "直播", "资质", "反馈", "product"],
  account: ["猫", "狗", "老虎", "虎", "猴", "猴子", "美女", "人物", "风景", "山", "海", "城市", "阿阳", "小院", "救助", "饭盆", "account", "pet"]
} as const;

const SUBJECT_KEYWORDS = {
  PERSON: ["美女", "人物", "女生", "女孩", "老人", "小孩", "主播", "路人", "阿阳"],
  ANIMAL: ["猫", "狗", "老虎", "虎", "猴", "猴子", "动物", "宠物", "鸟", "马"],
  LANDSCAPE: ["风景", "山", "海", "云", "城市", "街景", "小院", "夕阳", "天空", "户外"],
  OBJECT: ["道具", "物品", "饭盆", "笼子", "车辆", "工具"],
  EVENT: ["救助", "过程", "冲突", "互动", "活动", "事件"]
} as const;

type MockAssetGroup = keyof typeof MOCK_KEYWORDS;

type FrameVisualSample = {
  fileName: string;
  width: number;
  height: number;
  brightness: number;
  saturation: number;
  warmRatio: number;
  greenRatio: number;
  blueRatio: number;
};

type FrameAnalysisSummary = {
  frameCount: number;
  analyzedFrameCount: number;
  failedFrameCount: number;
  orientation: "vertical" | "horizontal" | "square" | "unknown";
  averageBrightness: number | null;
  averageSaturation: number | null;
  dominantTone: "warm" | "green" | "blue" | "neutral" | "unknown";
  visualHints: string[];
  samples: FrameVisualSample[];
};

function createUnknownClassification(
  reason: string,
  diagnostics?: Record<string, unknown>
): AiClassification {
  return {
    assetType: "UNKNOWN",
    primaryCategory: UNSORTED_DIR,
    aiSuggestedRootCategory: "未知",
    aiSuggestedSubCategory: "待整理",
    subjectType: "UNKNOWN",
    subject: "待整理",
    scene: "待整理",
    action: "待整理",
    usage: "待整理",
    emotionTags: [],
    usageTags: ["待人工整理"],
    visualTags: [],
    sceneTags: [],
    subjectTags: [],
    actionTags: [],
    contentIntent: "UNKNOWN",
    contentLongevity: "UNKNOWN",
    topicSuggestion: "",
    topicName: "",
    contentTags: [],
    painPointTags: [],
    structureTags: [],
    summary: reason,
    suggestedFileNameParts: {
      subject: "待整理",
      actionScene: "待整理",
      usage: "待整理"
    },
    confidence: 0.2,
    needsHumanReview: true,
    diagnostics
  };
}

export class OpenAiProviderError extends Error {
  status?: number;
  requestId?: string | null;
  errorType?: string;

  constructor(message: string, options?: { status?: number; requestId?: string | null; errorType?: string }) {
    super(message);
    this.name = "OpenAiProviderError";
    this.status = options?.status;
    this.requestId = options?.requestId;
    this.errorType = options?.errorType;
  }
}

function summarizeOpenAiErrorLegacy(error: unknown) {
  if (error instanceof OpenAiProviderError) {
    return {
      message: error.message,
      status: error.status ?? null,
      requestId: error.requestId ?? null,
      errorType: error.errorType || classifyOpenAiError(error.status, error.message)
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    status: null,
    requestId: null,
    errorType: classifyOpenAiError(null, message)
  };
}

function classifyOpenAiError(status?: number | null, message = "") {
  const text = message.toLowerCase();
  if (status === 401) return "authentication_failed";
  if (status === 429) return "rate_limited_or_quota_exceeded";
  if (status === 400 && (text.includes("image") || text.includes("vision"))) return "model_or_image_input_not_supported";
  if (text.includes("timeout") || text.includes("aborted")) return "request_timeout";
  if (text.includes("json") || text.includes("schema")) return "schema_or_json_parse_failed";
  if (status && status >= 500) return "openai_server_error";
  if (status) return "openai_http_error";
  return "network_or_runtime_error";
}

function providerLabel(provider: "openai" | "volcengine") {
  return provider === "volcengine" ? "火山方舟" : "OpenAI";
}

function validateClassification(value: unknown, fallbackReason: string) {
  const parsed = AiClassificationSchema.safeParse(value);
  if (!parsed.success) {
    return {
      classification: createUnknownClassification(
        `${fallbackReason}：AI 输出 JSON 未通过 schema 校验，已进入待整理。`
      ),
      warnings: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  return { classification: parsed.data, warnings: [] };
}

function containsChinese(value?: string | null) {
  return Boolean(value && /[\u4e00-\u9fff]/.test(value));
}

function englishLike(value?: string | null) {
  if (!value) return false;
  const letters = value.match(/[a-zA-Z]/g)?.length ?? 0;
  const chinese = value.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  return letters >= 4 && chinese === 0;
}

function translateCommonAiText(value?: string | null, field?: string) {
  if (!value) return value ?? "";
  if (containsChinese(value)) return value;
  let text = value.toLowerCase();
  const replacements: Array<[RegExp, string]> = [
    [/white fluffy cat|white cat/g, "白色长毛猫"],
    [/fluffy cat/g, "长毛猫"],
    [/\bcat\b|cats/g, "猫"],
    [/\bdog\b|dogs/g, "狗"],
    [/tiger/g, "老虎"],
    [/monkey/g, "猴子"],
    [/person|people|human/g, "人物"],
    [/indoor pet exhibition\/shop setting|pet exhibition\/shop setting|pet exhibition|shop setting/g, "室内宠物展会/门店"],
    [/indoors|indoor/g, "室内"],
    [/outdoors|outdoor/g, "户外"],
    [/holding and petting|held and petted|petting/g, "抱着并抚摸"],
    [/holding/g, "抱着"],
    [/walking/g, "走动"],
    [/running/g, "奔跑"],
    [/jumping/g, "跳跃"],
    [/food bowl/g, "饭盆"],
    [/cat bed/g, "猫窝"],
    [/floral tablecloth/g, "花纹桌布"],
    [/cute animal interactions|cute interaction/g, "可爱互动"],
    [/fluffy fur/g, "毛发蓬松"],
    [/content creation for social media|content creation|social media/g, "社媒内容"],
    [/video of/g, "画面展示"],
    [/features/g, "包含"],
    [/ideal for/g, "适合用于"],
    [/animal interactions/g, "动物互动"]
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\bwith\b/g, "，带有")
    .replace(/\band\b/g, "和")
    .replace(/\bin an?\b/g, "在")
    .replace(/\bsetting\b/g, "环境")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "")
    .replace(/[(),.]/g, "，")
    .replace(/，+/g, "，")
    .replace(/^，|，$/g, "");

  if (containsChinese(text)) return text;
  if (field === "usage") return "待确认用途";
  if (field === "scene") return "待确认场景";
  if (field === "action") return "待确认动作";
  if (field === "summary") return "AI 返回了英文摘要，系统已标记为需要人工确认。";
  return "待确认";
}

function localizeClassificationText(classification: AiClassification) {
  const before = JSON.stringify(classification);
  const localized = {
    ...classification,
    subject: translateCommonAiText(classification.subject, "subject"),
    scene: translateCommonAiText(classification.scene, "scene"),
    action: translateCommonAiText(classification.action, "action"),
    usage: translateCommonAiText(classification.usage, "usage"),
    productName: translateCommonAiText(classification.productName, "productName"),
    platform: translateCommonAiText(classification.platform, "platform"),
    referenceType: translateCommonAiText(classification.referenceType, "referenceType"),
    hookType: translateCommonAiText(classification.hookType, "hookType"),
    summary: translateCommonAiText(classification.summary, "summary"),
    conflictReason: translateCommonAiText(classification.conflictReason, "conflictReason"),
    topicSuggestion: translateCommonAiText(classification.topicSuggestion, "topicSuggestion"),
    topicName: translateCommonAiText(classification.topicName, "topicName"),
    emotionTags: classification.emotionTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    usageTags: classification.usageTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    visualTags: classification.visualTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    sceneTags: classification.sceneTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    subjectTags: classification.subjectTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    actionTags: classification.actionTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    contentTags: classification.contentTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    painPointTags: classification.painPointTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    structureTags: classification.structureTags?.map((item) => translateCommonAiText(item, "tag")) ?? [],
    suggestedFileNameParts: {
      ...classification.suggestedFileNameParts,
      subject: translateCommonAiText(classification.suggestedFileNameParts?.subject ?? classification.subject, "subject"),
      productName: translateCommonAiText(classification.suggestedFileNameParts?.productName ?? classification.productName, "productName"),
      actionScene: translateCommonAiText(classification.suggestedFileNameParts?.actionScene, "actionScene"),
      usage: translateCommonAiText(classification.suggestedFileNameParts?.usage ?? classification.usage, "usage"),
      platform: translateCommonAiText(classification.suggestedFileNameParts?.platform ?? classification.platform, "platform"),
      referenceType: translateCommonAiText(classification.suggestedFileNameParts?.referenceType ?? classification.referenceType, "referenceType"),
      hookType: translateCommonAiText(classification.suggestedFileNameParts?.hookType ?? classification.hookType, "hookType")
    }
  };
  const after = JSON.stringify(localized);
  return {
    classification: localized,
    changed: before !== after,
    stillEnglish: [
      localized.subject,
      localized.scene,
      localized.action,
      localized.usage,
      localized.summary,
      localized.suggestedFileNameParts?.subject,
      localized.suggestedFileNameParts?.actionScene,
      localized.suggestedFileNameParts?.usage
    ].some((item) => englishLike(item))
  };
}

function includesAny(text: string, keywords: readonly string[]) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function matchedKeywords(text: string, keywords: readonly string[]) {
  return keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
}

function summarizeKeywordMatches(text: string) {
  return {
    reference: matchedKeywords(text, MOCK_KEYWORDS.reference),
    product: matchedKeywords(text, MOCK_KEYWORDS.product),
    account: matchedKeywords(text, MOCK_KEYWORDS.account)
  };
}

function inferSubjectProfile(text: string, frameAnalysis?: FrameAnalysisSummary) {
  if (includesAny(text, SUBJECT_KEYWORDS.PERSON)) {
    const subject = includesAny(text, ["美女", "女生", "女孩"]) ? "女性人物" : includesAny(text, ["阿阳"]) ? "阿阳" : "人物";
    return {
      subjectType: "PERSON",
      subject,
      category: "02_账号素材/01_人物镜头",
      scene: includesAny(text, ["街", "城市"]) ? "街头" : "待确认",
      action: includesAny(text, ["回眸"]) ? "回眸" : "待确认",
      visualTags: ["人物", includesAny(text, ["美女", "女生", "女孩"]) ? "颜值向" : "人物镜头"].filter(Boolean),
      contentIntent: includesAny(text, ["热点", "吸引", "钩子"]) ? "HOOK" : "DAILY_CONTENT"
    } as const;
  }
  if (includesAny(text, SUBJECT_KEYWORDS.ANIMAL)) {
    const subject = includesAny(text, ["老虎", "虎"]) ? "老虎" : includesAny(text, ["猴"]) ? "猴子" : includesAny(text, ["狗"]) ? "狗" : includesAny(text, ["猫"]) ? "猫" : "动物";
    return {
      subjectType: "ANIMAL",
      subject,
      category: "02_账号素材/02_动物镜头",
      scene: includesAny(text, ["动物园"]) ? "动物园" : includesAny(text, ["小院"]) ? "小院" : "待确认",
      action: includesAny(text, ["奔跑"]) ? "奔跑" : includesAny(text, ["跳"]) ? "跳跃" : "待确认",
      visualTags: ["动物", subject, includesAny(text, ["老虎", "虎", "猴"]) ? "吸引眼球" : "日常"],
      contentIntent: includesAny(text, ["老虎", "虎", "猴", "热点", "吸引"]) ? "HOOK" : "DAILY_CONTENT"
    } as const;
  }
  if (includesAny(text, SUBJECT_KEYWORDS.LANDSCAPE)) {
    return {
      subjectType: "LANDSCAPE",
      subject: includesAny(text, ["风景", "山", "海", "云"]) ? "风景" : "场景环境",
      category: "02_账号素材/03_场景环境",
      scene: includesAny(text, ["山"]) ? "山地" : includesAny(text, ["海"]) ? "海边" : includesAny(text, ["城市"]) ? "城市" : "户外环境",
      action: includesAny(text, ["云"]) ? "云雾流动" : "空镜",
      visualTags: ["风景", "环境", "空镜"],
      contentIntent: "DAILY_CONTENT"
    } as const;
  }
  if (includesAny(text, SUBJECT_KEYWORDS.EVENT)) {
    return {
      subjectType: "EVENT",
      subject: "事件",
      category: "02_账号素材/04_事件过程",
      scene: "待确认",
      action: includesAny(text, ["救助"]) ? "救助过程" : "事件过程",
      visualTags: ["事件", "过程"],
      contentIntent: includesAny(text, ["专题"]) ? "TOPIC" : "DAILY_CONTENT"
    } as const;
  }
  if (includesAny(text, SUBJECT_KEYWORDS.OBJECT)) {
    return {
      subjectType: "OBJECT",
      subject: includesAny(text, ["饭盆"]) ? "饭盆" : "物品",
      category: "02_账号素材/05_物品道具",
      scene: "待确认",
      action: "展示",
      visualTags: ["物品", "道具"],
      contentIntent: "DAILY_CONTENT"
    } as const;
  }
  if (frameAnalysis?.dominantTone === "green") {
    return {
      subjectType: "LANDSCAPE",
      subject: "场景环境",
      category: "02_账号素材/03_场景环境",
      scene: "户外环境",
      action: "空镜",
      visualTags: ["环境", "户外", "视觉启发式"],
      contentIntent: "DAILY_CONTENT"
    } as const;
  }
  return {
    subjectType: "UNKNOWN",
    subject: "待确认",
    category: "02_账号素材/99_待整理",
    scene: "待确认",
    action: "待确认",
    visualTags: ["待人工确认"],
    contentIntent: "UNKNOWN"
  } as const;
}

function buildMockDiagnostics(params: {
  context: ClassifierContext;
  checkedText: string;
  selectedGroup?: MockAssetGroup;
  frameAnalysis?: FrameAnalysisSummary;
  visualHeuristic?: string;
  reason: string;
}) {
  return {
    provider: "mock",
    reason: params.reason,
    importantNote:
      "mock AI 会读取关键帧做基础视觉统计和低置信度启发式判断，但它不是视觉大模型；主体级识别建议使用 AI_PROVIDER=openai 或后续 local provider。",
    checkedFields: {
      originalFileName: params.context.originalFileName,
      uploaderName: params.context.uploaderName || "",
      notes: params.context.notes || "",
      manualAssetType: params.context.manualAssetType || "AUTO"
    },
    matchedKeywords: summarizeKeywordMatches(params.checkedText),
    selectedGroup: params.selectedGroup || null,
    frameAnalysis: params.frameAnalysis || null,
    visualHeuristic: params.visualHeuristic || null,
    keywordRules: {
      account: MOCK_KEYWORDS.account,
      product: MOCK_KEYWORDS.product,
      reference: MOCK_KEYWORDS.reference
    },
    suggestion:
      "如果继续使用 mock，请在备注或文件名里补充关键词，例如“猫、狗、阿阳、小院、产品、丝兰、对标、抖音”等，或在电脑上传页手动选择素材类型。"
  };
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(3));
}

export class MaterialClassifierService {
  async classifyMaterial(frames: string[], context: ClassifierContext): Promise<ClassifierResult> {
    const startedAt = Date.now();
    const { config } = await aiProviderConfigService.getResolvedConfig();

    if (isOpenAiCompatibleProvider(config.provider)) {
      const requestedProvider = config.provider;
      const apiKey = requestedProvider === "volcengine" ? config.arkApiKey : config.openaiApiKey;
      const baseUrl =
        requestedProvider === "volcengine" ? config.volcengineBaseUrl : config.baseUrl || "https://api.openai.com/v1";
      const proxyUrl =
        requestedProvider === "volcengine" ? config.volcengineProxyUrl : config.openaiProxyUrl;
      const missingKeyName = requestedProvider === "volcengine" ? "ARK_API_KEY" : "OPENAI_API_KEY";
      const label = providerLabel(requestedProvider);

      if (!apiKey) {
        const mock = await mockProvider.classify(frames, context, validateClassification);
        return this.withRunMetadata({
          ...mock,
          requestedProvider,
          usedFallback: true,
          diagnostics: {
            requestedProvider,
            actualProvider: "mock",
            provider: requestedProvider,
            model: config.model,
            baseUrl,
            frameCount: frames.length,
            sentFrameCount: 0,
            imageDetail: config.imageDetail,
            timeoutMs: config.requestTimeoutMs,
            proxyEnabled: Boolean(proxyUrl),
            requestId: null,
            status: null,
            fallbackUsed: true,
            errorSummary: `未配置 ${missingKeyName}，已自动回退 mock AI。`,
            errorType: "missing_api_key"
          },
          warnings: [`AI_PROVIDER=${requestedProvider} 但未配置 ${missingKeyName}，已自动回退 mock AI。`, ...mock.warnings]
        }, startedAt, config.model);
      }

      try {
        const result = await openAiCompatibleProvider.classify(frames, context, {
          provider: requestedProvider,
          model: config.model,
          apiKey,
          baseUrl,
          frameMax: config.frameMax,
          imageDetail: config.imageDetail,
          requestTimeoutMs: config.requestTimeoutMs,
          proxyUrl,
          buildPrompt: (promptContext) => this.buildPrompt(promptContext),
          outputJsonSchema: (noNullableUnion) => this.outputJsonSchema(noNullableUnion),
          validateClassification,
          localizeClassificationText
        });
        return this.withRunMetadata(result, startedAt, config.model);
      } catch (error) {
        const mock = await mockProvider.classify(frames, context, validateClassification);
        const openAiError = summarizeOpenAiError(error);
        return this.withRunMetadata({
          ...mock,
          requestedProvider,
          usedFallback: true,
          diagnostics: {
            requestedProvider,
            actualProvider: "mock",
            provider: requestedProvider,
            model: config.model,
            baseUrl,
            frameCount: frames.length,
            sentFrameCount: Math.min(frames.length, config.frameMax),
            imageDetail: config.imageDetail,
            timeoutMs: config.requestTimeoutMs,
            proxyEnabled: Boolean(proxyUrl),
            requestId: openAiError.requestId,
            status: openAiError.status,
            fallbackUsed: true,
            errorSummary: openAiError.message,
            errorType: openAiError.errorType
          },
          warnings: [`${label} 调用失败，已回退 mock AI：${openAiError.message}`, ...mock.warnings]
        }, startedAt, config.model);
      }
    }

    if (isReservedLocalProvider(config.provider)) {
      const requestedProvider = toRuntimeProvider(config.provider);
      const mock = await mockProvider.classify(frames, context, validateClassification);
      const errorSummary =
        config.provider === "local"
          ? "AI_PROVIDER=local 已预留接口，第一版暂未部署本地模型，当前使用 mock AI。"
          : `AI_PROVIDER=${config.provider} 已预留接口，本轮不启用真实本地模型调用，当前使用 mock AI。`;
      return this.withRunMetadata({
        ...mock,
        provider: requestedProvider,
        requestedProvider,
        usedFallback: true,
        diagnostics: {
          requestedProvider,
          actualProvider: "mock",
          provider: requestedProvider,
          model: config.localModel || config.model,
          baseUrl: config.localBaseUrl || undefined,
          frameCount: frames.length,
          sentFrameCount: 0,
          fallbackUsed: true,
          errorSummary,
          errorType: `${config.provider}_provider_not_implemented`
        },
        warnings: [errorSummary]
      }, startedAt, config.localModel || config.model || config.provider);
    }

    const result = await mockProvider.classify(frames, context, validateClassification);
    return this.withRunMetadata(result, startedAt, "mock");
  }

  private withRunMetadata(result: Omit<ClassifierResult, "actualProvider" | "modelName" | "durationMs"> & Partial<ClassifierResult>, startedAt: number, fallbackModelName: string): ClassifierResult {
    const actualProvider = result.diagnostics?.actualProvider ?? result.provider;
    const modelName = result.diagnostics?.model || (actualProvider === "mock" ? "mock" : fallbackModelName);
    return {
      ...result,
      actualProvider,
      modelName,
      fallbackProvider: result.usedFallback ? actualProvider : result.fallbackProvider ?? null,
      durationMs: Math.max(0, Date.now() - startedAt),
      errorMessage: result.diagnostics?.errorSummary ?? result.errorMessage ?? null
    };
  }

  async mockClassify(framesOrContext: string[] | ClassifierContext, maybeContext?: ClassifierContext): Promise<ClassifierResult> {
    const frames = Array.isArray(framesOrContext) ? framesOrContext : [];
    const context = Array.isArray(framesOrContext) ? maybeContext : framesOrContext;
    if (!context) {
      return mockProvider.classifyWithoutContext();
    }
    return mockProvider.classify(frames, context, validateClassification);
  }

  async legacyMockClassify(framesOrContext: string[] | ClassifierContext, maybeContext?: ClassifierContext): Promise<ClassifierResult> {
    const frames = Array.isArray(framesOrContext) ? framesOrContext : [];
    const context = Array.isArray(framesOrContext) ? maybeContext : framesOrContext;
    if (!context) return mockProvider.classifyWithoutContext();
    const text = `${context.originalFileName} ${context.uploaderName ?? ""} ${context.notes ?? ""}`.toLowerCase();
    const uploaderName = context.uploaderName || "阿阳";
    const frameAnalysisResult = await this.analyzeKeyFrames(frames);
    const frameAnalysis = frameAnalysisResult.summary;
    let output: AiClassification;

    if (
      context.manualAssetType === "REFERENCE_VIDEO" ||
      includesAny(text, MOCK_KEYWORDS.reference)
    ) {
      output = {
        assetType: "REFERENCE_VIDEO",
        primaryCategory: "04_对标视频/02_产品对标",
        aiSuggestedRootCategory: "对标视频",
        aiSuggestedSubCategory: includesAny(text, ["账号"]) ? "账号对标" : "产品对标",
        subjectType: "EVENT",
        platform: includesAny(text, ["快手"]) ? "快手" : "抖音",
        referenceType: includesAny(text, ["账号"]) ? "账号对标" : "产品对标",
        hookType: includesAny(text, ["封面", "标题"]) ? "封面标题" : "痛点开头",
        emotionTags: [],
        usageTags: ["结构参考"],
        visualTags: ["对标", "结构拆解"],
        sceneTags: [],
        subjectTags: ["对标视频"],
        actionTags: ["结构参考"],
        contentIntent: "REFERENCE",
        contentLongevity: "SEASONAL",
        topicSuggestion: includesAny(text, ["账号"]) ? "账号对标拆解" : "产品对标拆解",
        topicName: "",
        contentTags: [],
        painPointTags: [],
        structureTags: ["强痛点", "产品解决", "使用对比"],
        mainTakeaway: "这条视频适合参考开头痛点放大和中段解决方案表达。",
        summary: "mock AI 判断为对标视频，可用于拆解开头钩子、结构和转化表达。",
        suggestedFileNameParts: {
          platform: includesAny(text, ["快手"]) ? "快手" : "抖音",
          referenceType: includesAny(text, ["账号"]) ? "账号对标" : "产品对标",
          hookType: includesAny(text, ["封面", "标题"]) ? "封面标题" : "痛点开头"
        },
        confidence: 0.79,
        needsHumanReview: true,
        diagnostics: buildMockDiagnostics({
          context,
          checkedText: text,
          selectedGroup: "reference",
          frameAnalysis,
          reason:
            context.manualAssetType === "REFERENCE_VIDEO"
              ? "电脑上传页手动选择了对标视频，mock 按预选类型生成建议。"
              : "命中对标视频关键词，mock 归类为 REFERENCE_VIDEO。"
        })
      };
    } else if (
      context.manualAssetType === "PRODUCT_MATERIAL" ||
      includesAny(text, MOCK_KEYWORDS.product)
    ) {
      output = {
        assetType: "PRODUCT_MATERIAL",
        primaryCategory: includesAny(text, ["空镜", "封面"]) ? "03_产品素材/02_产品空镜" : "03_产品素材/01_痛点镜头",
        aiSuggestedRootCategory: "产品素材",
        aiSuggestedSubCategory: includesAny(text, ["空镜", "封面"]) ? "产品空镜" : "痛点镜头",
        subjectType: "PRODUCT",
        productName: includesAny(text, ["丝兰"]) ? "丝兰" : "产品",
        subject: "宠物",
        scene: "家庭环境",
        action: includesAny(text, ["空镜", "封面"]) ? "产品展示" : "焦躁走动",
        usage: includesAny(text, ["口播"]) ? "口播素材" : "痛点开头",
        emotionTags: [],
        usageTags: ["转化素材"],
        visualTags: ["产品素材", includesAny(text, ["空镜", "封面"]) ? "产品展示" : "痛点表达"],
        sceneTags: ["家庭环境"],
        subjectTags: ["宠物", includesAny(text, ["丝兰"]) ? "丝兰" : "产品"],
        actionTags: [includesAny(text, ["空镜", "封面"]) ? "产品展示" : "焦躁走动"],
        contentIntent: "PRODUCT_SUPPORT",
        contentLongevity: "LONG_TERM",
        topicSuggestion: includesAny(text, ["丝兰"]) ? "丝兰产品素材" : "产品转化素材",
        topicName: "",
        contentTags: [],
        painPointTags: ["宠物焦躁", "主人困扰"],
        structureTags: [],
        conversionStage: "开头痛点",
        summary: "mock AI 判断画面适合产品内容，可作为痛点、产品空镜或转化片段候选。",
        suggestedFileNameParts: {
          uploaderName: uploaderName || "家涛",
          productName: includesAny(text, ["丝兰"]) ? "丝兰" : "产品",
          actionScene: includesAny(text, ["空镜", "封面"]) ? "产品空镜" : "宠物焦躁",
          usage: includesAny(text, ["口播"]) ? "口播素材" : "痛点开头"
        },
        confidence: includesAny(text, ["产品", "丝兰"]) ? 0.86 : 0.76,
        needsHumanReview: !includesAny(text, ["产品", "丝兰"]),
        diagnostics: buildMockDiagnostics({
          context,
          checkedText: text,
          selectedGroup: "product",
          frameAnalysis,
          reason:
            context.manualAssetType === "PRODUCT_MATERIAL"
              ? "电脑上传页手动选择了产品素材，mock 按预选类型生成建议。"
              : "命中产品素材关键词，mock 归类为 PRODUCT_MATERIAL。"
        })
      };
    } else if (context.manualAssetType === "ACCOUNT_MATERIAL" || includesAny(text, MOCK_KEYWORDS.account)) {
      const profile = inferSubjectProfile(text, frameAnalysis);
      output = {
        assetType: "ACCOUNT_MATERIAL",
        primaryCategory: profile.contentIntent === "HOOK" ? "02_账号素材/08_热点素材" : profile.category,
        aiSuggestedRootCategory: "账号素材",
        aiSuggestedSubCategory: profile.contentIntent === "HOOK" ? "热点素材" : profile.category.split("/").at(-1)?.replace(/^\d+_/, "") || "待整理",
        subjectType: profile.subjectType,
        subject: profile.subject,
        scene: profile.scene,
        action: profile.action,
        usage: includesAny(text, ["封面"]) ? "封面" : profile.contentIntent === "HOOK" ? "开头钩子" : "待确认",
        emotionTags: profile.subjectType === "ANIMAL" ? ["好奇", "吸引"] : profile.subjectType === "PERSON" ? ["吸引", "情绪"] : [],
        usageTags: profile.contentIntent === "HOOK" ? ["开头钩子", "吸引眼球"] : ["日常素材", "可检索"],
        visualTags: [...profile.visualTags],
        sceneTags: [profile.scene].filter((item) => item !== "待确认"),
        subjectTags: [profile.subject, profile.subjectType].filter(Boolean),
        actionTags: [profile.action].filter((item) => item !== "待确认"),
        contentIntent: profile.contentIntent,
        contentLongevity: includesAny(text, ["专题", "长期"]) ? "LONG_TERM" : profile.contentIntent === "HOOK" ? "ONE_OFF" : "SEASONAL",
        topicSuggestion: includesAny(text, ["专题"]) ? `${profile.subject}专题` : profile.contentIntent === "HOOK" ? `${profile.subject}吸引眼球素材` : "",
        topicName: "",
        contentTags: [...profile.visualTags],
        painPointTags: [],
        structureTags: [],
        summary: `mock AI 判断为账号素材，主体倾向为${profile.subject}，建议作为${profile.contentIntent === "HOOK" ? "热点吸引或开头钩子" : "日常可检索素材"}。`,
        suggestedFileNameParts: {
          uploaderName,
          subject: profile.subject,
          actionScene: profile.action === "待确认" ? profile.scene : `${profile.scene}${profile.action}`.replace(/待确认/g, "") || "待整理",
          usage: includesAny(text, ["封面"]) ? "封面" : profile.contentIntent === "HOOK" ? "开头钩子" : "待确认"
        },
        confidence: profile.subjectType === "UNKNOWN" ? 0.62 : includesAny(text, ["猫", "狗", "小院", "老虎", "虎", "猴", "美女", "人物", "风景"]) ? 0.88 : 0.72,
        needsHumanReview: profile.subjectType === "UNKNOWN" || !includesAny(text, ["猫", "狗", "小院", "老虎", "虎", "猴", "美女", "人物", "风景"]),
        diagnostics: buildMockDiagnostics({
          context,
          checkedText: text,
          selectedGroup: "account",
          frameAnalysis,
          reason:
            context.manualAssetType === "ACCOUNT_MATERIAL"
              ? "电脑上传页手动选择了账号素材，mock 按预选类型生成建议。"
              : "命中账号素材关键词，mock 归类为 ACCOUNT_MATERIAL。"
        })
      };
    } else {
      output = this.classifyFromFrameHeuristics(context, text, frameAnalysis);
    }

    const validated = validateClassification(output, "mock AI 输出异常");
    return {
      classification: validated.classification,
      provider: "mock",
      requestedProvider: "mock",
      usedFallback: false,
      diagnostics: {
        requestedProvider: "mock",
        actualProvider: "mock",
        provider: "mock",
        frameCount: frames.length,
        sentFrameCount: 0,
        fallbackUsed: false,
        note: "mock AI 是本地免费兜底逻辑，不调用线上模型。"
      },
      warnings: [...frameAnalysisResult.warnings, ...validated.warnings],
      raw: output
    };
  }

  async analyzeKeyFrames(frames: string[]): Promise<{
    summary: FrameAnalysisSummary;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const samples: FrameVisualSample[] = [];

    for (const frame of frames.slice(0, 8)) {
      try {
        const image = sharp(frame).rotate().resize(48, 48, { fit: "inside" }).removeAlpha();
        const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
        const sample = this.summarizeFramePixels(frame, data, info.width, info.height);
        samples.push(sample);
      } catch (error) {
        warnings.push(`mock 关键帧视觉统计失败：${path.basename(frame)} ${(error as Error).message}`);
      }
    }

    const summary = this.summarizeFrameSamples(frames.length, samples);
    return { summary, warnings };
  }

  summarizeFramePixels(framePath: string, data: Buffer, width: number, height: number): FrameVisualSample {
    let brightnessTotal = 0;
    let saturationTotal = 0;
    let warmCount = 0;
    let greenCount = 0;
    let blueCount = 0;
    const pixelCount = Math.max(1, data.length / 3);

    for (let index = 0; index < data.length; index += 3) {
      const red = data[index] ?? 0;
      const green = data[index + 1] ?? 0;
      const blue = data[index + 2] ?? 0;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      brightnessTotal += (red + green + blue) / (3 * 255);
      saturationTotal += max === 0 ? 0 : (max - min) / max;
      if (red > green + 18 && red > blue + 18) warmCount += 1;
      if (green > red + 12 && green > blue + 12) greenCount += 1;
      if (blue > red + 12 && blue > green + 12) blueCount += 1;
    }

    return {
      fileName: path.basename(framePath),
      width,
      height,
      brightness: roundMetric(brightnessTotal / pixelCount),
      saturation: roundMetric(saturationTotal / pixelCount),
      warmRatio: roundMetric(warmCount / pixelCount),
      greenRatio: roundMetric(greenCount / pixelCount),
      blueRatio: roundMetric(blueCount / pixelCount)
    };
  }

  summarizeFrameSamples(frameCount: number, samples: FrameVisualSample[]): FrameAnalysisSummary {
    if (samples.length === 0) {
      return {
        frameCount,
        analyzedFrameCount: 0,
        failedFrameCount: frameCount,
        orientation: "unknown",
        averageBrightness: null,
        averageSaturation: null,
        dominantTone: "unknown",
        visualHints: frameCount === 0 ? ["没有可分析的关键帧。"] : ["关键帧读取失败，无法做视觉统计。"],
        samples: []
      };
    }

    const averageBrightness = average(samples.map((sample) => sample.brightness));
    const averageSaturation = average(samples.map((sample) => sample.saturation));
    const warmRatio = average(samples.map((sample) => sample.warmRatio));
    const greenRatio = average(samples.map((sample) => sample.greenRatio));
    const blueRatio = average(samples.map((sample) => sample.blueRatio));
    const first = samples[0];
    const orientation =
      Math.abs(first.width - first.height) <= 2
        ? "square"
        : first.height > first.width
          ? "vertical"
          : "horizontal";
    const toneScores = [
      ["warm", warmRatio],
      ["green", greenRatio],
      ["blue", blueRatio]
    ] as const;
    const [dominantTone, dominantScore] = toneScores.reduce((best, item) => (item[1] > best[1] ? item : best));
    const visualHints = [
      `已分析 ${samples.length}/${frameCount} 张关键帧。`,
      orientation === "vertical" ? "画面为竖屏。" : orientation === "horizontal" ? "画面为横屏。" : "画面接近方形。",
      averageBrightness >= 0.68 ? "画面整体偏亮。" : averageBrightness <= 0.28 ? "画面整体偏暗。" : "画面亮度中等。",
      averageSaturation >= 0.42 ? "色彩饱和度较高。" : averageSaturation <= 0.18 ? "色彩饱和度较低。" : "色彩饱和度中等。"
    ];
    if (dominantScore >= 0.18) {
      visualHints.push(
        dominantTone === "green"
          ? "关键帧绿色占比较高，可能包含户外、植物或场景环境。"
          : dominantTone === "warm"
            ? "关键帧暖色占比较高，可能包含室内灯光、皮肤、木色或暖色背景。"
            : "关键帧蓝色占比较高，可能包含天空、屏幕或冷色背景。"
      );
    }

    return {
      frameCount,
      analyzedFrameCount: samples.length,
      failedFrameCount: Math.max(0, frameCount - samples.length),
      orientation,
      averageBrightness: roundMetric(averageBrightness),
      averageSaturation: roundMetric(averageSaturation),
      dominantTone: dominantScore >= 0.18 ? dominantTone : "neutral",
      visualHints,
      samples
    };
  }

  classifyFromFrameHeuristics(
    context: ClassifierContext,
    checkedText: string,
    frameAnalysis: FrameAnalysisSummary
  ): AiClassification {
    const firstSample = frameAnalysis.samples[0];
    const greenRatio = average(frameAnalysis.samples.map((sample) => sample.greenRatio));
    const brightness = frameAnalysis.averageBrightness ?? 0;
    const saturation = frameAnalysis.averageSaturation ?? 0;

    if (frameAnalysis.analyzedFrameCount > 0 && greenRatio >= 0.22) {
      return {
        assetType: "ACCOUNT_MATERIAL",
        primaryCategory: "02_账号素材/03_场景环境",
        aiSuggestedRootCategory: "账号素材",
        aiSuggestedSubCategory: "场景环境",
        subjectType: "LANDSCAPE",
        subject: "场景环境",
        scene: "户外环境",
        action: "空镜",
        usage: "空镜转场",
        emotionTags: [],
        usageTags: ["待人工确认"],
        visualTags: ["环境", "户外", "视觉启发式"],
        sceneTags: ["户外环境"],
        subjectTags: ["场景环境"],
        actionTags: ["空镜"],
        contentIntent: "DAILY_CONTENT",
        contentLongevity: "SEASONAL",
        topicSuggestion: "",
        topicName: "",
        contentTags: ["视觉启发式"],
        painPointTags: [],
        structureTags: [],
        summary:
          "mock 已分析关键帧，画面绿色占比较高，低置信度建议按场景环境类账号素材待确认。",
        suggestedFileNameParts: {
          uploaderName: context.uploaderName || "未命名",
          subject: "待确认",
          actionScene: "户外环境",
          usage: "空镜"
        },
        confidence: 0.62,
        needsHumanReview: true,
        diagnostics: buildMockDiagnostics({
          context,
          checkedText,
          selectedGroup: "account",
          frameAnalysis,
          visualHeuristic: `greenRatio=${roundMetric(greenRatio)}，orientation=${frameAnalysis.orientation}`,
          reason:
            "没有命中文本关键词，但关键帧绿色占比较高，mock 低置信度建议为账号素材/场景环境，必须人工确认。"
        })
      };
    }

    if (
      frameAnalysis.analyzedFrameCount > 0 &&
      brightness >= 0.68 &&
      saturation <= 0.22 &&
      firstSample
    ) {
      return {
        assetType: "PRODUCT_MATERIAL",
        primaryCategory: "03_产品素材/02_产品空镜",
        aiSuggestedRootCategory: "产品素材",
        aiSuggestedSubCategory: "产品空镜",
        subjectType: "PRODUCT",
        productName: "产品待确认",
        subject: "产品待确认",
        scene: "明亮背景",
        action: "展示",
        usage: "待确认",
        emotionTags: [],
        usageTags: ["待人工确认"],
        visualTags: ["产品空镜", "视觉启发式"],
        sceneTags: ["明亮背景"],
        subjectTags: ["产品待确认"],
        actionTags: ["展示"],
        contentIntent: "PRODUCT_SUPPORT",
        contentLongevity: "UNKNOWN",
        topicSuggestion: "",
        topicName: "",
        contentTags: ["视觉启发式"],
        painPointTags: [],
        structureTags: [],
        conversionStage: "待确认",
        summary:
          "mock 已分析关键帧，画面偏亮且饱和度较低，低置信度建议按产品空镜待确认。",
        suggestedFileNameParts: {
          uploaderName: context.uploaderName || "未命名",
          productName: "产品待确认",
          actionScene: "明亮背景",
          usage: "待确认"
        },
        confidence: 0.61,
        needsHumanReview: true,
        diagnostics: buildMockDiagnostics({
          context,
          checkedText,
          selectedGroup: "product",
          frameAnalysis,
          visualHeuristic: `brightness=${brightness}，saturation=${saturation}`,
          reason:
            "没有命中文本关键词，但关键帧偏亮且饱和度较低，mock 低置信度建议为产品空镜，必须人工确认。"
        })
      };
    }

    return createUnknownClassification(
      "mock 已分析关键帧，但未获得足够视觉证据判断素材类型",
      buildMockDiagnostics({
        context,
        checkedText,
        frameAnalysis,
        visualHeuristic:
          frameAnalysis.analyzedFrameCount > 0
            ? `brightness=${frameAnalysis.averageBrightness ?? "未知"}，saturation=${frameAnalysis.averageSaturation ?? "未知"}，tone=${frameAnalysis.dominantTone}`
            : "没有可用关键帧",
        reason:
          "没有命中文本关键词，关键帧基础视觉统计也没有达到低置信度分类阈值，所以进入 UNKNOWN/待整理。"
      })
    );
  }

  async openAiClassify(
    frames: string[],
    context: ClassifierContext,
    config: OpenAiRequestConfig
  ): Promise<ClassifierResult> {
    const label = providerLabel(config.provider);
    const sentFrames = frames.slice(0, config.frameMax);
    const imageInputs = await Promise.all(
      sentFrames.map(async (frame) => ({
        type: "input_image",
        detail: config.imageDetail,
        image_url: await this.toDataUrl(frame)
      }))
    );

    const requestBody = {
      model: config.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: this.buildPrompt(context)
            },
            ...imageInputs
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "video_material_classification",
          strict: true,
          schema: this.outputJsonSchema(config.provider === "volcengine")
        }
      }
    };

    const response = await this.postOpenAiJson({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      body: requestBody,
      timeoutMs: config.requestTimeoutMs,
      proxyUrl: config.proxyUrl
    });

    const requestId = response.headers["x-request-id"] || null;
    if (response.status < 200 || response.status >= 300) {
      const errorMessage = this.extractOpenAiErrorMessage(response.body);
      throw new OpenAiProviderError(`${label} API ${response.status}: ${errorMessage}`, {
        status: response.status,
        requestId,
        errorType: classifyOpenAiError(response.status, errorMessage)
      });
    }

    const raw = JSON.parse(response.body) as Record<string, unknown>;
    const outputText = this.extractOutputText(raw);
    if (!outputText) {
      throw new OpenAiProviderError(`${label} API 未返回可解析的 JSON 文本。`, {
        status: response.status,
        requestId,
        errorType: "schema_or_json_parse_failed"
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText) as unknown;
    } catch (error) {
      throw new OpenAiProviderError(`${label} JSON 解析失败：${(error as Error).message}`, {
        status: response.status,
        requestId,
        errorType: "schema_or_json_parse_failed"
      });
    }

    const validated = validateClassification(parsedJson, `${label} 输出异常`);
    const localized = localizeClassificationText(validated.classification);
    const languageWarnings = [
      localized.changed ? `${label} 返回了英文自然语言字段，系统已尝试转为中文。` : "",
      localized.stillEnglish ? `${label} 输出中仍存在英文字段，请在详情页人工确认后再应用建议。` : ""
    ].filter(Boolean);
    return {
      classification: {
        ...localized.classification,
        needsHumanReview: localized.stillEnglish ? true : localized.classification.needsHumanReview
      },
      provider: config.provider,
      requestedProvider: config.provider,
      usedFallback: false,
      diagnostics: {
        requestedProvider: config.provider,
        actualProvider: config.provider,
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        frameCount: frames.length,
        sentFrameCount: sentFrames.length,
        imageDetail: config.imageDetail,
        timeoutMs: config.requestTimeoutMs,
        proxyEnabled: Boolean(config.proxyUrl),
        requestId,
        status: response.status,
        fallbackUsed: false,
        note: languageWarnings.join("；") || undefined
      },
      warnings: [...validated.warnings, ...languageWarnings],
      raw
    };
  }

  async postOpenAiJson({
    baseUrl,
    apiKey,
    body,
    timeoutMs,
    proxyUrl
  }: {
    baseUrl: string;
    apiKey: string;
    body: unknown;
    timeoutMs: number;
    proxyUrl?: string;
  }) {
    const payload = JSON.stringify(body);
    if (proxyUrl) {
      return this.postJsonThroughHttpProxy({
        targetUrl: `${baseUrl.replace(/\/$/, "")}/responses`,
        apiKey,
        payload,
        timeoutMs,
        proxyUrl
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`AI provider 请求超过 ${timeoutMs}ms 未响应`)), timeoutMs);
    const endpoint = `${baseUrl.replace(/\/$/, "")}/responses`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: payload,
        signal: controller.signal
      });
      const responseBody = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new OpenAiProviderError(`AI provider 请求 ${endpoint} 超过 ${timeoutMs}ms 未响应`, {
          errorType: "request_timeout"
        });
      }
      throw new OpenAiProviderError(`AI provider 请求 ${endpoint} 失败：${error instanceof Error ? error.message : String(error)}`, {
        errorType: "network_or_runtime_error"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  postJsonThroughHttpProxy({
    targetUrl,
    apiKey,
    payload,
    timeoutMs,
    proxyUrl
  }: {
    targetUrl: string;
    apiKey: string;
    payload: string;
    timeoutMs: number;
    proxyUrl: string;
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const target = new URL(targetUrl);
    const proxy = new URL(proxyUrl);

    if (proxy.protocol !== "http:") {
      throw new OpenAiProviderError("代理地址目前只支持 http://，例如 http://127.0.0.1:7890。", {
        errorType: "proxy_protocol_not_supported"
      });
    }

    return new Promise((resolve, reject) => {
      const socket = net.connect(Number(proxy.port || 80), proxy.hostname);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          new OpenAiProviderError(`AI provider 代理请求超过 ${timeoutMs}ms 未响应`, {
            errorType: "request_timeout"
          })
        );
      }, timeoutMs);
      let connectBuffer = "";
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(error);
      };

      socket.on("connect", () => {
        socket.write(
          [
            `CONNECT ${target.hostname}:443 HTTP/1.1`,
            `Host: ${target.hostname}:443`,
            "Proxy-Connection: Keep-Alive",
            "",
            ""
          ].join("\r\n")
        );
      });

      socket.on("data", (chunk) => {
        connectBuffer += chunk.toString("utf8");
        if (!connectBuffer.includes("\r\n\r\n")) return;
        if (!/^HTTP\/1\.[01] 200/.test(connectBuffer)) {
          fail(new OpenAiProviderError(`代理连接 AI provider 失败：${connectBuffer.split("\r\n")[0] || "未知错误"}`));
          return;
        }

        socket.removeAllListeners("data");
        const secureSocket = tls.connect({ socket, servername: target.hostname }, () => {
          const request = [
            `POST ${target.pathname} HTTP/1.1`,
            `Host: ${target.hostname}`,
            `Authorization: Bearer ${apiKey}`,
            "Content-Type: application/json",
            `Content-Length: ${Buffer.byteLength(payload)}`,
            "Connection: close",
            "",
            payload
          ].join("\r\n");
          secureSocket.write(request);
        });
        const chunks: Buffer[] = [];
        secureSocket.on("data", (data) => chunks.push(Buffer.from(data)));
        secureSocket.on("error", fail);
        secureSocket.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(this.parseHttpResponse(Buffer.concat(chunks)));
        });
      });

      socket.on("error", fail);
    });
  }

  parseHttpResponse(raw: Buffer) {
    const separator = raw.indexOf("\r\n\r\n");
    const headBuffer = separator >= 0 ? raw.subarray(0, separator) : raw;
    const bodyBuffer = separator >= 0 ? raw.subarray(separator + 4) : Buffer.alloc(0);
    const head = headBuffer.toString("latin1");
    const headerLines = head.split("\r\n");
    const status = Number(headerLines[0]?.split(" ")[1] || 0);
    const headers: Record<string, string> = {};
    for (const line of headerLines.slice(1)) {
      const index = line.indexOf(":");
      if (index === -1) continue;
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
    return {
      status,
      headers,
      body: headers["transfer-encoding"] === "chunked"
        ? this.decodeChunkedBody(bodyBuffer).toString("utf8")
        : bodyBuffer.toString("utf8")
    };
  }

  decodeChunkedBody(body: Buffer) {
    let index = 0;
    const chunks: Buffer[] = [];
    while (index < body.byteLength) {
      const nextLine = body.indexOf("\r\n", index);
      if (nextLine === -1) return chunks.length ? Buffer.concat(chunks) : body;
      const sizeText = body.subarray(index, nextLine).toString("latin1").split(";")[0];
      const size = Number.parseInt(sizeText, 16);
      if (!Number.isFinite(size)) return chunks.length ? Buffer.concat(chunks) : body;
      if (size === 0) return Buffer.concat(chunks);
      const chunkStart = nextLine + 2;
      chunks.push(body.subarray(chunkStart, chunkStart + size));
      index = chunkStart + size + 2;
    }
    return Buffer.concat(chunks);
  }

  extractOpenAiErrorMessage(body: string) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
      return parsed.error?.message || body.slice(0, 500);
    } catch {
      return body.slice(0, 500);
    }
  }

  async testOpenAiConnection() {
    return this.testAiConnection();
  }

  async testAiConnection(options: { configId?: string } = {}) {
    const resolved = await aiProviderConfigService.getResolvedConfig(options);
    const { config } = resolved;
    const configDiagnostics = {
      source: resolved.source,
      requestedConfigId: options.configId || null,
      configId: resolved.dbConfigId || null,
      configName: resolved.dbConfigName || (resolved.source === "env" ? ".env" : null)
    };
    if (config.provider === "mock") {
      return {
        ok: true,
        provider: config.provider,
        model: "mock",
        message: "AI_PROVIDER=mock 使用本地兜底逻辑，不需要连接测试。",
        diagnostics: {
          ...configDiagnostics,
          requestedProvider: "mock",
          actualProvider: "mock",
          provider: "mock",
          fallbackUsed: false,
          localVisionEnabled: false,
          note: "mock 不调用线上或本地模型。"
        }
      };
    }

    if (config.provider === "local") {
      return {
        ok: false,
        provider: config.provider,
        model: config.localModel || config.model,
        message: "AI_PROVIDER=local 是旧本地占位，尚未启用真实模型识别；当前入库会回退 mock。",
        diagnostics: {
          ...configDiagnostics,
          requestedProvider: "local",
          actualProvider: "mock",
          provider: "local",
          baseUrl: config.localBaseUrl || "",
          model: config.localModel || config.model,
          apiKeyConfigured: Boolean(config.localApiKey),
          healthcheckUrl: config.localHealthcheckUrl || "",
          timeoutMs: config.requestTimeoutMs,
          fallbackUsed: true,
          localVisionEnabled: false,
          errorType: "local_provider_not_enabled"
        }
      };
    }

    if (isLocalOpenAiCompatibleProvider(config.provider)) {
      const result = await localHealthcheckService.testLocalOpenAiCompatible({
        baseUrl: config.localBaseUrl || config.baseUrl,
        apiKey: config.localApiKey,
        model: config.localModel || config.model,
        healthcheckUrl: config.localHealthcheckUrl,
        timeoutMs: config.requestTimeoutMs
      });
      return { ...result, diagnostics: { ...configDiagnostics, ...result.diagnostics } };
    }

    if (isLocalOllamaProvider(config.provider)) {
      const result = await localHealthcheckService.testLocalOllama({
        baseUrl: config.localBaseUrl || config.baseUrl || "http://127.0.0.1:11434",
        apiKey: config.localApiKey,
        model: config.localModel || config.model,
        healthcheckUrl: config.localHealthcheckUrl,
        timeoutMs: config.requestTimeoutMs
      });
      return { ...result, diagnostics: { ...configDiagnostics, ...result.diagnostics } };
    }

    if (config.provider !== "openai" && config.provider !== "volcengine") {
      return {
        ok: false,
        provider: config.provider,
        model: config.model,
        message: "当前 AI_PROVIDER 不是 openai 或 volcengine。请先在 .env 设置 AI_PROVIDER=openai 或 AI_PROVIDER=volcengine。",
        diagnostics: {
          ...configDiagnostics,
          requestedProvider: config.provider,
          actualProvider: config.provider,
          provider: config.provider,
          model: config.model,
          frameCount: 0,
          sentFrameCount: 0,
          imageDetail: config.imageDetail,
          timeoutMs: config.requestTimeoutMs,
          proxyEnabled: Boolean(config.openaiProxyUrl || config.volcengineProxyUrl),
          fallbackUsed: false,
          errorType: "provider_not_openai"
        }
      };
    }

    const requestedProvider = config.provider;
    const apiKey = requestedProvider === "volcengine" ? config.arkApiKey : config.openaiApiKey;
    const baseUrl =
      requestedProvider === "volcengine" ? config.volcengineBaseUrl : config.baseUrl || "https://api.openai.com/v1";
    const proxyUrl =
      requestedProvider === "volcengine" ? config.volcengineProxyUrl : config.openaiProxyUrl;
    const missingKeyName = requestedProvider === "volcengine" ? "ARK_API_KEY" : "OPENAI_API_KEY";
    const label = providerLabel(requestedProvider);
    const endpoint = `${baseUrl.replace(/\/$/, "")}/responses`;

    if (!apiKey) {
      return {
        ok: false,
        provider: requestedProvider,
        model: config.model,
        message: `未配置 ${missingKeyName}。`,
        diagnostics: {
          ...configDiagnostics,
          requestedProvider,
          actualProvider: "mock",
          provider: requestedProvider,
          model: config.model,
          baseUrl,
          endpoint,
          frameCount: 0,
          sentFrameCount: 0,
          imageDetail: config.imageDetail,
          timeoutMs: config.requestTimeoutMs,
          proxyEnabled: Boolean(proxyUrl),
          fallbackUsed: true,
          errorType: "missing_api_key"
        }
      };
    }

    try {
      const imageDataUrl = await this.createTinyTestImageDataUrl();
      const response = await this.postOpenAiJson({
        baseUrl,
        apiKey,
        timeoutMs: config.requestTimeoutMs,
        proxyUrl,
        body: {
          model: config.model,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: "请识别这张测试图，并只返回 JSON：{\"ok\":true,\"summary\":\"...\"}"
                },
                {
                  type: "input_image",
                  detail: config.imageDetail,
                  image_url: imageDataUrl
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "openai_connection_test",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  ok: { type: "boolean" },
                  summary: { type: "string" }
                },
                required: ["ok", "summary"]
              }
            }
          }
        }
      });

      const requestId = response.headers["x-request-id"] || null;
      if (response.status < 200 || response.status >= 300) {
        const errorMessage = this.extractOpenAiErrorMessage(response.body);
        return {
          ok: false,
          provider: requestedProvider,
          model: config.model,
          message: `${label} API ${response.status}: ${errorMessage}`,
          diagnostics: {
            ...configDiagnostics,
            requestedProvider,
            actualProvider: requestedProvider,
            provider: requestedProvider,
            model: config.model,
            baseUrl,
            endpoint,
            frameCount: 1,
            sentFrameCount: 1,
            imageDetail: config.imageDetail,
            timeoutMs: config.requestTimeoutMs,
            proxyEnabled: Boolean(proxyUrl),
            requestId,
            status: response.status,
            fallbackUsed: false,
            errorType: classifyOpenAiError(response.status, errorMessage)
          }
        };
      }

      const raw = JSON.parse(response.body) as Record<string, unknown>;
      const outputText = this.extractOutputText(raw);
      return {
        ok: Boolean(outputText),
        provider: requestedProvider,
        model: config.model,
        message: outputText ? `${label} 连接测试成功，模型支持图片输入和结构化输出。` : `${label} 有响应，但未返回可解析文本。`,
        outputText,
        diagnostics: {
          ...configDiagnostics,
          requestedProvider,
          actualProvider: requestedProvider,
          provider: requestedProvider,
          model: config.model,
          baseUrl,
          endpoint,
          frameCount: 1,
          sentFrameCount: 1,
          imageDetail: config.imageDetail,
          timeoutMs: config.requestTimeoutMs,
          proxyEnabled: Boolean(proxyUrl),
          requestId,
          status: response.status,
          fallbackUsed: false,
          errorType: outputText ? undefined : "schema_or_json_parse_failed"
        }
      };
    } catch (error) {
      const openAiError = summarizeOpenAiError(error);
      return {
        ok: false,
        provider: requestedProvider,
        model: config.model,
        message: openAiError.message,
        diagnostics: {
          ...configDiagnostics,
          requestedProvider,
          actualProvider: requestedProvider,
          provider: requestedProvider,
          model: config.model,
          baseUrl,
          endpoint,
          frameCount: 1,
          sentFrameCount: 1,
          imageDetail: config.imageDetail,
          timeoutMs: config.requestTimeoutMs,
          proxyEnabled: Boolean(proxyUrl),
          requestId: openAiError.requestId,
          status: openAiError.status,
          fallbackUsed: false,
          errorType: openAiError.errorType
        }
      };
    }
  }

  async createTinyTestImageDataUrl() {
    const data = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 0, g: 128, b: 96 }
      }
    })
      .jpeg({ quality: 70 })
      .toBuffer();
    return `data:image/jpeg;base64,${data.toString("base64")}`;
  }

  async toDataUrl(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
    const data = await fs.readFile(filePath);
    return `data:${mimeType};base64,${data.toString("base64")}`;
  }

  extractOutputText(response: Record<string, unknown>) {
    if (typeof response.output_text === "string") return response.output_text;
    const output = response.output;
    if (!Array.isArray(output)) return null;

    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const contentItem of content) {
        const text = (contentItem as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }

    return null;
  }

  buildPrompt(context: ClassifierContext) {
    return [
      "你是视频素材入库助手。你只能根据关键帧和上下文输出固定 JSON，不要输出 Markdown。",
      "不要创建新文件夹，只能从系统给定的大类中建议 primaryCategory。",
      "assetType 只允许 ACCOUNT_MATERIAL、PRODUCT_MATERIAL、REFERENCE_VIDEO、PUBLIC_RESOURCE、UNKNOWN。",
      "subjectType 只允许 PERSON、ANIMAL、LANDSCAPE、PRODUCT、OBJECT、EVENT、UNKNOWN。",
      "contentIntent 只允许 DAILY_CONTENT、HOOK、TOPIC、PRODUCT_SUPPORT、REFERENCE、TEST、UNKNOWN。",
      "contentLongevity 只允许 ONE_OFF、SEASONAL、LONG_TERM、UNKNOWN。",
      "所有字段都必须输出。没有内容的可选文本字段请输出空字符串，不要输出 null。",
      "非常重要：除 assetType、subjectType、contentIntent、contentLongevity 这些枚举值外，所有自然语言字段必须使用简体中文。",
      "必须用中文输出的字段包括：primaryCategory、aiSuggestedRootCategory、aiSuggestedSubCategory、subject、scene、action、usage、productName、platform、referenceType、hookType、emotionTags、usageTags、visualTags、sceneTags、subjectTags、actionTags、topicSuggestion、topicName、contentTags、painPointTags、structureTags、conversionStage、mainTakeaway、summary、conflictReason、suggestedFileNameParts 内所有字段。",
      "不要输出 white cat、indoors、holding and petting、content creation 等英文短语；要输出“白猫”“室内宠物展会/门店”“抱着并抚摸”“社媒内容”等中文。",
      "summary 必须是 1 句中文摘要，文件名建议字段必须是短中文词，不要是英文长句。",
      "如果用户已经选择视频大类或二级目录，请优先尊重用户选择。你的任务主要是补充主体类型、主体、场景、动作、情绪、用途、视觉标签、搜索标签、专题建议、摘要和文件名建议。",
      "如果你认为人工选择明显不对，请填写 conflictReason，不要直接覆盖人工选择。",
      "不要把老虎、美女、猴子、风景等具体题材创建为目录；它们应进入 subject、subjectType、visualTags、topicSuggestion 等索引字段。",
      "若不确定，请降低 confidence 并设置 needsHumanReview=true。",
      "",
      "允许分类：",
      "账号素材：02_账号素材/01_人物镜头、02_账号素材/02_动物镜头、02_账号素材/03_场景环境、02_账号素材/04_事件过程、02_账号素材/05_物品道具、02_账号素材/06_情绪钩子、02_账号素材/07_空镜转场、02_账号素材/08_热点素材、02_账号素材/99_待整理。",
      "产品素材：03_产品素材/01_痛点镜头、03_产品素材/02_产品空镜、03_产品素材/03_使用过程、03_产品素材/04_对比证明、03_产品素材/05_资质反馈、03_产品素材/06_直播促单、03_产品素材/07_口播素材、03_产品素材/99_待整理。",
      "对标视频：04_对标视频/01_账号对标、04_对标视频/02_产品对标、04_对标视频/03_爆款结构、04_对标视频/04_封面标题、04_对标视频/05_直播带货、04_对标视频/99_待整理。",
      "公共资源：07_公共资源/音乐音效、07_公共资源/字幕模板、07_公共资源/Logo贴纸、07_公共资源/片尾素材、07_公共资源/其他资源。",
      "",
      "可上传栏目列表（用于 suggestedCategoryId）：",
      context.categoryOptions?.length
        ? context.categoryOptions
            .map((category) =>
              `- id=${category.id}；name=${category.name}；relativePath=${category.relativePath}；assetType=${category.assetType}${category.aiDescription ? `；aiDescription=${category.aiDescription}` : ""}`
            )
            .join("\n")
        : "当前没有可选栏目。",
      "suggestedCategoryId 只能从上面的 id 中选择。无法判断或没有合适栏目时，suggestedCategoryId 输出空字符串。",
      "suggestedCategoryId 只是 AI 建议，不代表最终入库目录；如果用户已经选择栏目，必须尊重用户选择。",
      "",
      `原文件名：${context.originalFileName}`,
      `上传人：${context.uploaderName || "未填写"}`,
      `拍摄人：${context.shooterName || context.uploaderName || "未填写"}`,
      `用户选择大类：${context.userSelectedRootCategory || "自动判断"}`,
      `用户选择二级目录：${context.userSelectedSubCategory || "让 AI 判断"}`,
      `自定义标签：${context.customTags?.join("、") || "无"}`,
      `备注：${context.notes || "无"}`,
      `人工预选素材类型：${context.manualAssetType || "AUTO"}`,
      `文件信息：大小 ${context.fileSize} bytes，MIME ${context.mimeType || "未知"}，时长 ${context.duration ?? "未知"} 秒，尺寸 ${context.width ?? "未知"}x${context.height ?? "未知"}，方向 ${context.orientation || "未知"}。`
    ].join("\n");
  }

  outputJsonSchema(noNullableUnion = false) {
    const optionalTextType = noNullableUnion ? { type: "string" } : { type: ["string", "null"] };
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        assetType: {
          type: "string",
          enum: ["ACCOUNT_MATERIAL", "PRODUCT_MATERIAL", "REFERENCE_VIDEO", "PUBLIC_RESOURCE", "UNKNOWN"]
        },
        primaryCategory: { type: "string" },
        aiSuggestedRootCategory: { type: "string" },
        aiSuggestedSubCategory: { type: "string" },
        suggestedCategoryId: { type: "string" },
        subjectType: {
          type: "string",
          enum: ["PERSON", "ANIMAL", "LANDSCAPE", "PRODUCT", "OBJECT", "EVENT", "UNKNOWN"]
        },
        subject: optionalTextType,
        scene: optionalTextType,
        action: optionalTextType,
        usage: optionalTextType,
        productName: optionalTextType,
        platform: optionalTextType,
        referenceType: optionalTextType,
        hookType: optionalTextType,
        emotionTags: { type: "array", items: { type: "string" } },
        usageTags: { type: "array", items: { type: "string" } },
        visualTags: { type: "array", items: { type: "string" } },
        sceneTags: { type: "array", items: { type: "string" } },
        subjectTags: { type: "array", items: { type: "string" } },
        actionTags: { type: "array", items: { type: "string" } },
        contentIntent: {
          type: "string",
          enum: ["DAILY_CONTENT", "HOOK", "TOPIC", "PRODUCT_SUPPORT", "REFERENCE", "TEST", "UNKNOWN"]
        },
        contentLongevity: {
          type: "string",
          enum: ["ONE_OFF", "SEASONAL", "LONG_TERM", "UNKNOWN"]
        },
        topicSuggestion: { type: "string" },
        topicName: { type: "string" },
        contentTags: { type: "array", items: { type: "string" } },
        painPointTags: { type: "array", items: { type: "string" } },
        structureTags: { type: "array", items: { type: "string" } },
        conversionStage: optionalTextType,
        mainTakeaway: optionalTextType,
        summary: { type: "string" },
        conflictReason: { type: "string" },
        suggestedFileNameParts: {
          type: "object",
          additionalProperties: false,
          properties: {
            uploaderName: optionalTextType,
            subject: optionalTextType,
            productName: optionalTextType,
            actionScene: optionalTextType,
            usage: optionalTextType,
            platform: optionalTextType,
            referenceType: optionalTextType,
            hookType: optionalTextType,
            resourceType: optionalTextType,
            keyword: optionalTextType,
            dataPoint: optionalTextType
          },
          required: [
            "uploaderName",
            "subject",
            "productName",
            "actionScene",
            "usage",
            "platform",
            "referenceType",
            "hookType",
            "resourceType",
            "keyword",
            "dataPoint"
          ]
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        needsHumanReview: { type: "boolean" }
      },
      required: [
        "assetType",
        "primaryCategory",
        "aiSuggestedRootCategory",
        "aiSuggestedSubCategory",
        "suggestedCategoryId",
        "subjectType",
        "subject",
        "scene",
        "action",
        "usage",
        "productName",
        "platform",
        "referenceType",
        "hookType",
        "emotionTags",
        "usageTags",
        "visualTags",
        "sceneTags",
        "subjectTags",
        "actionTags",
        "contentIntent",
        "contentLongevity",
        "topicSuggestion",
        "topicName",
        "contentTags",
        "painPointTags",
        "structureTags",
        "conversionStage",
        "mainTakeaway",
        "summary",
        "conflictReason",
        "suggestedFileNameParts",
        "confidence",
        "needsHumanReview"
      ]
    };
  }
}

export const materialClassifierService = new MaterialClassifierService();

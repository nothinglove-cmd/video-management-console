export const AI_PROVIDERS = ["mock", "openai", "volcengine", "local", "local_openai_compatible", "local_ollama"] as const;
export const AI_IMAGE_DETAILS = ["low", "auto", "high"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];
export type ImageDetail = (typeof AI_IMAGE_DETAILS)[number];

export const OPENAI_RECOMMENDED_MODELS = [
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5",
  "gpt-5 mini",
  "gpt-4.1"
];

export const LOCAL_RECOMMENDED_MODELS = [
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "llava",
  "qwen2.5vl",
  "minicpm-v"
];

export type ProviderPreset = {
  label: string;
  hint: string;
  modelPlaceholder: string;
  recommendedModels: string[];
  defaults: {
    model?: string;
    baseUrl?: string;
    volcengineBaseUrl?: string;
    localBaseUrl?: string;
    fallbackProvider?: AiProvider;
    frameMax?: number;
    imageDetail?: ImageDetail;
    requestTimeoutMs?: number;
  };
};

export const AI_PROVIDER_PRESETS: Record<AiProvider, ProviderPreset> = {
  mock: {
    label: "Mock 本地兜底",
    hint: "Mock 不调用外部 AI，不需要模型或 API Key。",
    modelPlaceholder: "",
    recommendedModels: [],
    defaults: {
      model: "",
      fallbackProvider: "mock",
      frameMax: 5,
      imageDetail: "low",
      requestTimeoutMs: 60000
    }
  },
  openai: {
    label: "OpenAI",
    hint: "OpenAI provider 可直接使用官方接口；如使用中转站，在高级设置填写兼容 OpenAI 的 Base URL。",
    modelPlaceholder: "gpt-5.2",
    recommendedModels: OPENAI_RECOMMENDED_MODELS,
    defaults: {
      model: "gpt-5.2",
      baseUrl: "https://api.openai.com/v1",
      fallbackProvider: "mock",
      frameMax: 5,
      imageDetail: "low",
      requestTimeoutMs: 60000
    }
  },
  volcengine: {
    label: "火山方舟",
    hint: "火山方舟使用 Endpoint ID 作为模型名，例如 ep-xxxx。",
    modelPlaceholder: "请输入火山方舟 Endpoint ID，例如 ep-xxxx",
    recommendedModels: [],
    defaults: {
      volcengineBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      fallbackProvider: "mock",
      frameMax: 5,
      imageDetail: "low",
      requestTimeoutMs: 60000
    }
  },
  local: {
    label: "Local 旧占位",
    hint: "旧本地占位，暂不启用真实识别；入库识别仍会回退 mock。",
    modelPlaceholder: "",
    recommendedModels: [],
    defaults: {
      fallbackProvider: "mock"
    }
  },
  local_openai_compatible: {
    label: "OpenAI-compatible 中转站",
    hint: "用于兼容 OpenAI 格式的中转站或本地服务。请填写 Base URL、API Key 和支持图片输入的模型。",
    modelPlaceholder: "例如 gpt-4o-mini / gpt-4.1-mini / 中转站模型名",
    recommendedModels: LOCAL_RECOMMENDED_MODELS,
    defaults: {
      fallbackProvider: "mock",
      frameMax: 5,
      imageDetail: "low",
      requestTimeoutMs: 60000
    }
  },
  local_ollama: {
    label: "Ollama",
    hint: "Ollama 只做本地 healthcheck，暂不启用真实视觉识别。",
    modelPlaceholder: "llava / qwen2.5vl / minicpm-v",
    recommendedModels: LOCAL_RECOMMENDED_MODELS,
    defaults: {
      localBaseUrl: "http://127.0.0.1:11434",
      fallbackProvider: "mock",
      requestTimeoutMs: 60000
    }
  }
};

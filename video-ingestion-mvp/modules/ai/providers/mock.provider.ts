import path from "node:path";
import sharp from "sharp";

import { UNSORTED_DIR } from "@/lib/storage/storage.constants";
import type { AiClassification, ClassifierContext, ClassifierResult } from "@/modules/ai/material-classifier.service";

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

export function createUnknownClassification(
  reason: string,
  diagnostics?: Record<string, unknown>
): AiClassification {
  return {
    assetType: "UNKNOWN",
    primaryCategory: UNSORTED_DIR,
    aiSuggestedRootCategory: "未知",
    aiSuggestedSubCategory: "待整理",
    suggestedCategoryId: "",
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

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(3));
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

function normalizeCategoryText(value?: string | null) {
  return (value || "").replace(/^\d+_/, "").trim().toLowerCase();
}

function matchSuggestedCategoryId(classification: AiClassification, context: ClassifierContext) {
  const options = context.categoryOptions || [];
  if (options.length === 0) return "";

  const primaryCategory = classification.primaryCategory || "";
  const suggestedSubCategory = normalizeCategoryText(classification.aiSuggestedSubCategory);
  const assetType = classification.assetType;

  const exactPath = options.find((category) => category.relativePath === primaryCategory);
  if (exactPath) return exactPath.id;

  const sameAssetTypeOptions = options.filter((category) => category.assetType === assetType);
  const searchOptions = sameAssetTypeOptions.length > 0 ? sameAssetTypeOptions : options;

  const byLastPathSegment = searchOptions.find((category) => {
    const lastSegment = category.relativePath.split("/").at(-1);
    return normalizeCategoryText(lastSegment) === suggestedSubCategory;
  });
  if (byLastPathSegment) return byLastPathSegment.id;

  const byName = searchOptions.find((category) => normalizeCategoryText(category.name) === suggestedSubCategory);
  return byName?.id || "";
}

export class MockProvider {
  async classify(frames: string[], context: ClassifierContext, validateClassification: (value: unknown, fallbackReason: string) => { classification: AiClassification; warnings: string[] }): Promise<ClassifierResult> {
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

    output = {
      ...output,
      suggestedCategoryId: matchSuggestedCategoryId(output, context)
    };

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

  async classifyWithoutContext(): Promise<ClassifierResult> {
    return {
      classification: createUnknownClassification("mock AI 缺少分类上下文，已进入待整理。"),
      provider: "mock",
      requestedProvider: "mock",
      usedFallback: false,
      warnings: ["mock AI 缺少分类上下文。"]
    };
  }

  async analyzeKeyFrames(frames: string[]): Promise<{ summary: FrameAnalysisSummary; warnings: string[] }> {
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
}

export const mockProvider = new MockProvider();

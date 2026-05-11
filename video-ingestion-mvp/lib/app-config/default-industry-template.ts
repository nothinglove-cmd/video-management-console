export const DEFAULT_INDUSTRY_TEMPLATE = {
  code: "short-video-team-default",
  name: "短视频团队素材入库默认模板",
  description: "面向短视频、电商、直播和本地生活团队的本地/NAS 优先素材入库默认配置。",
  scope: {
    workspace: "single",
    storage: "local-or-nas",
    ai: "provider-pluggable"
  },
  includes: {
    themeCode: "default",
    menuCode: "default",
    terminologyCode: "default"
  },
  categoryStrategy: {
    source: "storage.constants.ts",
    note: "V1-09A 只声明默认行业模板，不迁移真实默认栏目、目录创建或入库逻辑。"
  }
} as const;

export type DefaultIndustryTemplate = typeof DEFAULT_INDUSTRY_TEMPLATE;

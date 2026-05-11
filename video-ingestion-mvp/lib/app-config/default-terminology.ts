export const DEFAULT_TERMINOLOGY = {
  material: {
    singular: "素材",
    plural: "素材",
    idLabel: "素材 ID",
    detail: "素材详情",
    recent: "最近上传素材",
    empty: "没有符合条件的素材。"
  },
  category: {
    singular: "栏目",
    plural: "栏目",
    management: "栏目管理",
    directory: "栏目目录",
    decision: "栏目决策",
    userSelected: "人工栏目",
    final: "最终栏目"
  },
  shooter: {
    singular: "拍摄人",
    plural: "拍摄人",
    management: "拍摄人管理"
  },
  ingestion: {
    noun: "入库",
    queue: "入库队列",
    review: "入库确认",
    category: "入库栏目",
    success: "入库成功"
  },
  upload: {
    noun: "上传",
    mobile: "手机上传",
    desktop: "电脑上传",
    settings: "上传设置",
    progress: "上传进度",
    fileList: "上传文件列表",
    recent: "最近上传"
  },
  library: {
    noun: "素材库",
    all: "全部素材",
    searchPlaceholder: "搜索素材 ID / 文件名 / 标签 / 摘要"
  },
  trash: {
    noun: "回收站",
    deleteToTrash: "删除到回收站"
  },
  reference: {
    noun: "对标",
    material: "对标视频",
    library: "对标素材库"
  },
  aiSuggestion: {
    noun: "AI 建议",
    category: "AI 建议栏目",
    latest: "最新 AI 建议",
    history: "AI 历史"
  },
  derivativeFile: {
    singular: "派生文件",
    plural: "派生文件"
  }
} as const;

export type DefaultTerminology = typeof DEFAULT_TERMINOLOGY;

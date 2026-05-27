export type AppMenuIconKey =
  | "archive"
  | "folderKanban"
  | "folderTree"
  | "home"
  | "monitorUp"
  | "recycle"
  | "settings"
  | "smartphone"
  | "uploadCloud"
  | "users";

export type AppMenuItem = {
  id: string;
  href: string;
  label: string;
  iconKey: AppMenuIconKey;
  placements: readonly ("sidebar" | "dashboard")[];
  dashboardDescription?: string;
  exact?: boolean;
};

export const DEFAULT_MENU_ITEMS: readonly AppMenuItem[] = [
  {
    id: "dashboard",
    href: "/admin",
    label: "工作台",
    iconKey: "home",
    placements: ["sidebar"],
    exact: true
  },
  {
    id: "mobile-upload",
    href: "/mobile/upload",
    label: "手机上传",
    iconKey: "smartphone",
    placements: ["sidebar", "dashboard"],
    dashboardDescription: "拍摄后立即上传"
  },
  {
    id: "desktop-upload",
    href: "/upload",
    label: "电脑上传",
    iconKey: "monitorUp",
    placements: ["sidebar", "dashboard"],
    dashboardDescription: "批量上传文件"
  },
  {
    id: "ingest-review",
    href: "/admin/ingest-review",
    label: "入库队列",
    iconKey: "archive",
    placements: ["sidebar", "dashboard"],
    dashboardDescription: "处理待确认素材"
  },
  {
    id: "library",
    href: "/admin/library",
    label: "素材库",
    iconKey: "folderKanban",
    placements: ["sidebar", "dashboard"],
    dashboardDescription: "查看全部素材"
  },
  {
    id: "categories",
    href: "/admin/categories",
    label: "栏目管理",
    iconKey: "folderTree",
    placements: ["sidebar"]
  },
  {
    id: "shooters",
    href: "/admin/shooters",
    label: "拍摄人",
    iconKey: "users",
    placements: ["sidebar"]
  },
  {
    id: "users",
    href: "/admin/users",
    label: "用户管理",
    iconKey: "users",
    placements: ["sidebar"]
  },
  {
    id: "trash",
    href: "/admin/trash",
    label: "回收站",
    iconKey: "recycle",
    placements: ["sidebar"]
  },
  {
    id: "device-import",
    href: "/admin/device-import",
    label: "设备导入",
    iconKey: "uploadCloud",
    placements: ["sidebar", "dashboard"],
    dashboardDescription: "导入设备拷贝批次"
  },
  {
    id: "settings",
    href: "/admin/settings",
    label: "系统设置",
    iconKey: "settings",
    placements: ["sidebar"]
  }
] as const;

export type DefaultMenuItem = (typeof DEFAULT_MENU_ITEMS)[number];

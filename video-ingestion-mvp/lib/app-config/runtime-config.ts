import { DEFAULT_INDUSTRY_TEMPLATE } from "@/lib/app-config/default-industry-template";
import { DEFAULT_MENU_ITEMS } from "@/lib/app-config/default-menu";
import { DEFAULT_TERMINOLOGY } from "@/lib/app-config/default-terminology";
import {
  ACTIVE_THEME_SKIN_CODE,
  DEFAULT_THEME,
  THEME_SKIN_OPTIONS,
  THEME_SWITCHING_CAPABILITY
} from "@/lib/app-config/default-theme";

export function getRuntimeAppConfig() {
  return {
    theme: DEFAULT_THEME,
    themeSkins: {
      activeCode: ACTIVE_THEME_SKIN_CODE,
      options: THEME_SKIN_OPTIONS,
      switching: THEME_SWITCHING_CAPABILITY
    },
    menu: {
      items: DEFAULT_MENU_ITEMS,
      sidebarItems: DEFAULT_MENU_ITEMS.filter((item) => item.placements.includes("sidebar")),
      dashboardShortcuts: DEFAULT_MENU_ITEMS.filter((item) => item.placements.includes("dashboard"))
    },
    terminology: DEFAULT_TERMINOLOGY,
    industryTemplate: DEFAULT_INDUSTRY_TEMPLATE
  };
}

export type RuntimeAppConfig = ReturnType<typeof getRuntimeAppConfig>;

export const DEFAULT_THEME = {
  code: "default",
  name: "默认专业版",
  appName: "视频素材 AI 入库系统",
  description: "面向本地素材资产管理的浅色高密度工作台皮肤。",
  version: "1.0.0",
  mode: "light",
  breakpoints: {
    mobile: "0px",
    tablet: "640px",
    desktop: "1024px",
    wide: "1536px"
  },
  radius: {
    xs: "4px",
    sm: "6px",
    control: "8px",
    panel: "10px",
    card: "10px",
    section: "12px",
    full: "999px"
  },
  density: {
    name: "standard",
    shellPadding: {
      base: "0.75rem",
      sm: "1rem",
      lg: "1.25rem"
    },
    contentGap: {
      sm: "0.75rem",
      md: "1rem",
      lg: "1.25rem"
    },
    sectionGap: {
      sm: "0.75rem",
      md: "1rem",
      lg: "1.25rem"
    },
    controlHeight: {
      sm: "2rem",
      md: "2.25rem",
      lg: "2.75rem"
    },
    cardPadding: {
      base: "1rem",
      compact: "0.75rem",
      spacious: "1.25rem"
    },
    panelPadding: {
      base: "1rem",
      compact: "0.75rem",
      spacious: "1.25rem"
    }
  },
  typography: {
    pageTitle: {
      base: "24px",
      desktop: "28px",
      lineHeight: "1.18"
    },
    pageDescription: {
      size: "14px",
      lineHeight: "1.6"
    },
    sectionTitle: {
      size: "15px",
      lineHeight: "1.4"
    },
    panelTitle: {
      size: "18px",
      lineHeight: "1.35"
    },
    cardTitle: {
      size: "13px",
      lineHeight: "18px"
    },
    body: {
      size: "14px",
      lineHeight: "1.55"
    },
    bodyDense: {
      size: "13px",
      lineHeight: "18px"
    },
    label: {
      size: "12px",
      lineHeight: "16px"
    },
    value: {
      size: "13px",
      lineHeight: "18px"
    },
    meta: {
      size: "12px",
      lineHeight: "17px"
    },
    path: {
      size: "12px",
      lineHeight: "17px"
    },
    technical: {
      size: "12px",
      lineHeight: "16px"
    },
    tableHead: {
      size: "12px",
      lineHeight: "16px"
    },
    tableCell: {
      size: "13px",
      lineHeight: "18px"
    },
    badge: {
      size: "12px",
      lineHeight: "16px"
    },
    button: {
      size: "14px",
      lineHeight: "20px"
    },
    input: {
      size: "14px",
      lineHeight: "20px"
    }
  },
  colors: {
    background: "210 20% 97%",
    foreground: "220 32% 12%",
    muted: "210 22% 94%",
    mutedForeground: "218 12% 45%",
    card: "0 0% 100%",
    cardForeground: "220 32% 12%",
    border: "214 20% 88%",
    primary: "172 72% 25%",
    primaryForeground: "0 0% 100%",
    accent: "174 62% 42%",
    accentForeground: "0 0% 100%",
    destructive: "7 72% 52%",
    destructiveForeground: "0 0% 100%",
    ring: "172 72% 25%"
  },
  status: {
    success: {
      background: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      icon: "text-emerald-600",
      dot: "bg-emerald-500",
      softBackground: "#ecfdf5",
      softBorder: "#a7f3d0",
      softText: "#047857"
    },
    info: {
      background: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      icon: "text-blue-600",
      dot: "bg-blue-500",
      softBackground: "#eff6ff",
      softBorder: "#bfdbfe",
      softText: "#1d4ed8"
    },
    processing: {
      background: "bg-cyan-50",
      text: "text-cyan-700",
      border: "border-cyan-200",
      icon: "text-cyan-600",
      dot: "bg-cyan-500",
      softBackground: "#ecfeff",
      softBorder: "#a5f3fc",
      softText: "#0e7490"
    },
    review: {
      background: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      icon: "text-amber-600",
      dot: "bg-amber-500",
      softBackground: "#fffbeb",
      softBorder: "#fde68a",
      softText: "#b45309"
    },
    warning: {
      background: "bg-orange-50",
      text: "text-orange-700",
      border: "border-orange-200",
      icon: "text-orange-600",
      dot: "bg-orange-500",
      softBackground: "#fff7ed",
      softBorder: "#fed7aa",
      softText: "#c2410c"
    },
    danger: {
      background: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      icon: "text-red-600",
      dot: "bg-red-500",
      softBackground: "#fef2f2",
      softBorder: "#fecaca",
      softText: "#b91c1c"
    },
    neutral: {
      background: "bg-slate-100",
      text: "text-slate-700",
      border: "border-slate-200",
      icon: "text-slate-500",
      dot: "bg-slate-400",
      softBackground: "#f1f5f9",
      softBorder: "#e2e8f0",
      softText: "#475569"
    }
  },
  surface: {
    page: "#f5f7f8",
    panel: "#ffffff",
    header: "#ffffff",
    muted: "#f8fafc",
    subtle: "#f1f5f9",
    raised: "#ffffff",
    tableHeader: "#f8fafc",
    hover: "#f8fafc",
    selected: "#ecfdf5",
    input: "#ffffff",
    overlay: "rgba(15, 23, 42, 0.38)",
    border: "#e5e7eb",
    sidebar: "#053f39",
    sidebarMuted: "rgba(209, 250, 229, 0.72)",
    sidebarPanel: "rgba(255, 255, 255, 0.08)",
    sidebarActive: "rgba(20, 184, 166, 0.24)",
    panelShadow: "0 2px 8px rgba(16, 24, 40, 0.04)"
  },
  border: {
    default: "#e2e8f0",
    subtle: "#edf2f7",
    strong: "#cbd5e1",
    focus: "rgba(13, 148, 136, 0.42)",
    sidebar: "rgba(255, 255, 255, 0.12)"
  },
  shadow: {
    panel: "0 1px 2px rgba(15, 23, 42, 0.04)",
    card: "0 1px 3px rgba(15, 23, 42, 0.06)",
    elevated: "0 16px 36px rgba(15, 23, 42, 0.14)",
    focus: "0 0 0 3px rgba(13, 148, 136, 0.16)"
  },
  layout: {
    sidebarCollapsedWidth: "64px",
    sidebarExpandedWidth: "240px",
    headerHeight: "64px",
    headerHeightMobile: "52px",
    contentMaxWidth: "1680px",
    contentInsetDesktop: "24px",
    dashboardAsideWidth: "300px",
    drawerWidth: "460px",
    widths: {
      uploadAside: "320px",
      uploadContentMax: "1280px",
      librarySidebar: "232px",
      librarySidebarCollapsed: "58px",
      libraryContentMax: "1440px",
      libraryGridSmallMin: "144px",
      libraryGridMediumMin: "204px",
      libraryGridLargeMin: "280px",
      mobileDrawer: "86vw",
      mobileDrawerMax: "320px",
      modalSm: "420px",
      modalMd: "560px",
      modalLg: "1100px"
    },
    heights: {
      toolbarMin: "44px",
      mobileBottomBar: "56px",
      mediaPlaceholderSm: "3rem",
      mediaPlaceholderMd: "6rem",
      mediaPlaceholderLg: "10rem",
      thumbnailSmall: "6rem",
      thumbnailMedium: "9rem",
      thumbnailLarge: "11rem",
      emptyStateMin: "14rem",
      uploadDropzoneMin: "17.5rem",
      categoryRootTabMin: "2.5rem",
      categoryMobileRowMin: "4rem"
    }
  },
  spacing: {
    pageGap: "1rem",
    panelGap: "1rem",
    toolbarGap: "0.5rem",
    formGap: "1rem",
    listGap: "0.5rem"
  },
  media: {
    thumbnailBackground: "#f1f5f9",
    placeholderBackground: "#f8fafc",
    placeholderBorder: "#e2e8f0",
    placeholderIcon: "#94a3b8",
    previewBackground: "#020617"
  },
  button: {
    touchTargetMinHeight: "2.5rem",
    iconOnlySm: "2rem",
    iconOnlyMd: "2.25rem",
    toolbarControlHeight: "2.5rem"
  },
  zIndex: {
    header: 20,
    sidebar: 40,
    drawer: 40,
    mobileDrawer: 50,
    modal: 50,
    toast: 50,
    actionBar: 40
  }
} as const;

export const ACTIVE_THEME_SKIN_CODE = DEFAULT_THEME.code;

export const THEME_SKIN_OPTIONS = [
  {
    code: DEFAULT_THEME.code,
    name: DEFAULT_THEME.name,
    description: DEFAULT_THEME.description,
    mode: DEFAULT_THEME.mode,
    status: "ACTIVE",
    available: true,
    preview: {
      page: DEFAULT_THEME.surface.page,
      panel: DEFAULT_THEME.surface.panel,
      primary: `hsl(${DEFAULT_THEME.colors.primary})`,
      accent: `hsl(${DEFAULT_THEME.colors.accent})`
    }
  },
  {
    code: "dark-pro",
    name: "深色专业版",
    description: "适合暗光环境和大屏监看场景的深色工作台，后续接 ThemePreset 后启用。",
    mode: "dark",
    status: "PLANNED",
    available: false,
    preview: {
      page: "#0f172a",
      panel: "#111827",
      primary: "#14b8a6",
      accent: "#38bdf8"
    }
  },
  {
    code: "brand-custom",
    name: "品牌定制版",
    description: "预留客户品牌色、Logo 和行业模板绑定能力，后续商业版启用。",
    mode: "custom",
    status: "PLANNED",
    available: false,
    preview: {
      page: "#f8fafc",
      panel: "#ffffff",
      primary: "#0f766e",
      accent: "#f59e0b"
    }
  }
] as const;

export const THEME_SWITCHING_CAPABILITY = {
  enabled: false,
  currentCode: ACTIVE_THEME_SKIN_CODE,
  reason: "第一版先固定默认专业版，切换入口只做展示预留。",
  futureStorage: "Workspace.themePresetId + ThemePreset.config"
} as const;

export type DefaultTheme = typeof DEFAULT_THEME;
export type ThemeSkinOption = (typeof THEME_SKIN_OPTIONS)[number];

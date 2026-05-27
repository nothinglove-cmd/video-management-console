"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  BarChart3,
  ChevronsLeft,
  ChevronsRight,
  FolderKanban,
  FolderTree,
  Home,
  LogOut,
  MonitorUp,
  Recycle,
  Settings,
  Smartphone,
  UploadCloud,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@prisma/client";

import { skin } from "@/components/theme/skin";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import type { AppMenuIconKey } from "@/lib/app-config/default-menu";
import { menuAllowedRoles } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type SidebarUser = {
  username: string;
  displayName: string;
  role: UserRole;
};

const iconMap = {
  archive: Archive,
  folderKanban: FolderKanban,
  folderTree: FolderTree,
  home: Home,
  monitorUp: MonitorUp,
  recycle: Recycle,
  settings: Settings,
  smartphone: Smartphone,
  uploadCloud: UploadCloud,
  users: Users
} satisfies Record<AppMenuIconKey, LucideIcon>;

export function Sidebar({
  mobileOpen = false,
  collapsed = false,
  user,
  onLogout,
  onToggleCollapsed,
  onNavigate
}: {
  mobileOpen?: boolean;
  collapsed?: boolean;
  user: SidebarUser | null;
  onLogout: () => void;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { menu, theme } = getRuntimeAppConfig();
  const items = user
    ? menu.sidebarItems.filter((item) => menuAllowedRoles(item.id).includes(user.role))
    : [];
  const displayName = user?.displayName || user?.username || "未登录";
  const roleLabel = user ? ROLE_LABELS[user.role] : "访客";
  const avatarText = displayName.slice(0, 1) || "用";

  return (
    <aside
      style={skin.vars}
      className={cn(
        skin.sidebar.base,
        collapsed && skin.sidebar.collapsed,
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className={cn(skin.sidebar.logo, collapsed && "justify-center px-2")}>
        <div className={cn(skin.sidebar.logoMark, collapsed && "hidden")}>
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <p className="text-sm font-semibold">{theme.appName}</p>
          <p className={cn("text-xs", skin.sidebar.mutedText)}>Video Ingestion MVP</p>
        </div>
        <button
          type="button"
          className={cn(
            "hidden h-8 w-8 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] border border-white/10 bg-white/5 text-white/80 transition hover:bg-white/10 hover:text-white lg:flex",
            collapsed && "mx-0"
          )}
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "展开主菜单" : "收起主菜单"}
          title={collapsed ? "展开" : "收起"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className={cn("flex-1 space-y-1 px-3 py-4", collapsed && "px-2")}>
        {items.map((item) => {
          const Icon = iconMap[item.iconKey];
          const active =
            pathname === item.href ||
            (!item.exact && item.href !== "/admin" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                skin.sidebar.item,
                active && skin.sidebar.itemActive,
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className={cn("whitespace-nowrap", collapsed && "hidden")}>{item.label}</span>
              {collapsed ? (
                <span className={skin.sidebar.tooltip}>
                  {item.label}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-white/10 p-4", collapsed && "p-2")}>
        <div className={cn(skin.sidebar.userPanel, collapsed && "flex h-10 w-10 items-center justify-center p-0")}>
          {collapsed ? <span className="text-sm font-semibold">{avatarText}</span> : null}
          <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
            <p className="truncate text-sm font-semibold">{displayName}</p>
            <p className={cn("mt-0.5 text-xs", skin.sidebar.mutedText)}>{roleLabel}</p>
          </div>
          {!collapsed ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--skin-radius-control)] text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onLogout}
              aria-label="退出登录"
              title="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  USER: "普通用户"
};

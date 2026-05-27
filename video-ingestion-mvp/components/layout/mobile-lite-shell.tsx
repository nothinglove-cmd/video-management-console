"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  FolderKanban,
  FolderTree,
  Home,
  LogOut,
  Menu,
  MonitorUp,
  Recycle,
  Settings,
  Smartphone,
  UploadCloud,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@prisma/client";
import type React from "react";
import { useEffect, useState } from "react";

import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { getRuntimeAppConfig } from "@/lib/app-config/runtime-config";
import type { AppMenuIconKey } from "@/lib/app-config/default-menu";
import { menuAllowedRoles } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";

type CurrentUser = {
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

const mobileNavIds = new Set([
  "dashboard",
  "mobile-upload",
  "desktop-upload",
  "ingest-review",
  "library",
  "categories",
  "shooters",
  "users",
  "trash",
  "device-import",
  "settings"
]);

export function MobileLiteShell({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { menu, theme } = getRuntimeAppConfig();
  const items = menu.sidebarItems.filter((item) => currentUser && mobileNavIds.has(item.id) && menuAllowedRoles(item.id).includes(currentUser.role));
  const displayName = currentUser?.displayName || currentUser?.username || "未登录";

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { user?: CurrentUser | null }) => setCurrentUser(data.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div style={skin.vars} className={skin.page}>
      <header className={skin.shell.header}>
        <div className="mx-auto flex min-h-[var(--skin-header-height-mobile)] w-full max-w-md min-w-0 items-center gap-2 px-3 py-2 sm:max-w-2xl sm:px-4">
          <Button
            variant="secondary"
            size="sm"
            className="h-10 w-10 shrink-0 p-0"
            onClick={() => setOpen(true)}
            aria-label="打开主菜单"
          >
            <Menu className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            {eyebrow ? (
              <p className="truncate text-[11px] font-semibold tracking-normal text-primary">{eyebrow}</p>
            ) : null}
            <h1 className="truncate text-base font-semibold leading-5">{title}</h1>
          </div>
          <Button asChild variant="secondary" size="sm" className="h-10 w-10 shrink-0 p-0" aria-label="返回工作台">
            <Link href="/admin">
              <Home className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {open ? (
        <button
          type="button"
          aria-label="关闭主菜单"
          className="fixed inset-0 z-30 bg-[color:var(--skin-overlay)] backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[min(var(--skin-mobile-drawer-width),calc(100vw-32px))] max-w-[var(--skin-mobile-drawer-max-width)] flex-col border-r border-[color:var(--skin-sidebar-border)] bg-[color:var(--skin-sidebar-bg)] text-white shadow-[var(--skin-shadow-elevated)] transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-[var(--skin-header-height)] items-center gap-3 border-b border-[color:var(--skin-sidebar-border)] px-4">
          <div className={skin.sidebar.logoMark}>
            <BarChart3 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{theme.appName}</p>
            <p className={cn("truncate text-xs", skin.sidebar.mutedText)}>移动工作台</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 border border-white/10 bg-white/5 p-0 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setOpen(false)}
            aria-label="关闭主菜单"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <nav className="thin-scrollbar min-h-0 flex-1 space-y-1 overflow-auto px-3 py-4">
          {items.map((item) => {
            const Icon = iconMap[item.iconKey];
            const active = pathname === item.href || (!item.exact && item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(skin.sidebar.item, "min-h-[var(--skin-touch-target-min-height)]", active && skin.sidebar.itemActive)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className={cn(skin.sidebar.userPanel, "items-center justify-between gap-3")}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className={cn("mt-0.5 text-xs", skin.sidebar.mutedText)}>{currentUser ? ROLE_LABELS[currentUser.role] : "访客"}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 border border-white/10 bg-white/5 p-0 text-white hover:bg-white/10 hover:text-white"
              onClick={logout}
              aria-label="退出登录"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-md min-w-0 overflow-x-hidden px-3 py-4 sm:max-w-2xl sm:px-4">
        {children}
      </main>
    </div>
  );
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  USER: "普通用户"
};

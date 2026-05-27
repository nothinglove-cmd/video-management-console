"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, LogOut, Menu, Search, X } from "lucide-react";
import type { UserRole } from "@prisma/client";

import { Sidebar } from "@/components/layout/sidebar";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CurrentUser = {
  username: string;
  displayName: string;
  role: UserRole;
};

export function AppShell({
  children,
  mobileSearchMode = "compact"
}: {
  children: React.ReactNode;
  mobileSearchMode?: "inline" | "compact";
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(mobileSearchMode === "inline");
  const [globalQuery, setGlobalQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const router = useRouter();

  useEffect(() => {
    const stored = window.localStorage.getItem("video-ingestion.sidebar.collapsed");
    setSidebarCollapsed(stored === "true");
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { user?: CurrentUser | null }) => setCurrentUser(data.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("video-ingestion.sidebar.collapsed", String(next));
      return next;
    });
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = globalQuery.trim();
    router.push(query ? `/admin/library?q=${encodeURIComponent(query)}&scope=all` : "/admin/library");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div style={skin.vars} className={skin.page}>
      <Sidebar
        mobileOpen={mobileOpen}
        collapsed={sidebarCollapsed && !mobileOpen}
        user={currentUser}
        onLogout={logout}
        onToggleCollapsed={toggleSidebarCollapsed}
        onNavigate={() => setMobileOpen(false)}
      />
      {mobileOpen ? (
        <button
          type="button"
          aria-label="关闭导航"
          className="fixed inset-0 z-30 bg-[color:var(--skin-overlay)] backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className={sidebarCollapsed ? skin.shell.drawerContentOffset : skin.shell.standardContentOffset}>
        <header className={skin.shell.header}>
          <div className={skin.shell.headerInner}>
            <Button
              variant="secondary"
              size="sm"
              className="h-9 w-9 shrink-0 p-0 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开导航"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button asChild variant="secondary" size="sm" className="h-9 w-9 shrink-0 p-0 lg:hidden" aria-label="返回工作台">
              <Link href="/admin">
                <Home className="h-4 w-4" />
              </Link>
            </Button>

            <form
              onSubmit={submitSearch}
              className={cn(
                skin.shell.search,
                mobileSearchOpen ? "order-3 flex basis-full lg:order-none lg:basis-auto" : "hidden"
              )}
            >
              <Search className="h-4 w-4 shrink-0" />
              <input
                value={globalQuery}
                onChange={(event) => setGlobalQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                placeholder="搜索素材 ID、文件名、标签、摘要..."
              />
              <Button type="submit" size="sm" className="h-7 rounded-full px-3">
                搜索
              </Button>
            </form>

            {mobileSearchMode === "compact" ? (
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto h-9 w-9 shrink-0 p-0 lg:hidden"
                onClick={() => setMobileSearchOpen((current) => !current)}
                aria-label="打开搜索"
              >
                <Search className="h-4 w-4" />
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 w-9 shrink-0 p-0"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭导航"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="hidden shrink-0 items-center gap-3 text-sm lg:flex">
              <div className="h-8 w-8 rounded-[var(--skin-radius-full)] bg-primary text-center text-xs font-bold leading-8 text-primary-foreground shadow-[var(--skin-shadow-card)]">
                {(currentUser?.displayName || currentUser?.username || "用").slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="max-w-32 truncate font-semibold">{currentUser?.displayName || currentUser?.username || "未登录"}</p>
                <p className="text-xs text-muted-foreground">{currentUser ? ROLE_LABELS[currentUser.role] : "访客"}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 p-0" onClick={logout} aria-label="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className={skin.shell.main}>{children}</main>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  USER: "普通用户"
};

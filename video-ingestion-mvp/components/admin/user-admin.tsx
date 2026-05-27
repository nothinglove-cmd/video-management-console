"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserRole, UserStatus } from "@prisma/client";
import { RefreshCcw, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

type UserDto = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
};

const roleLabels: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  USER: "用户"
};

export function UserAdmin() {
  const [users, setUsers] = useState<UserDto[]>([]);
  const [currentUser, setCurrentUser] = useState<UserDto | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("USER");
  const [message, setMessage] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [loading, setLoading] = useState(true);

  const creatableRoles = useMemo<UserRole[]>(
    () => currentUser?.role === "SUPER_ADMIN" ? ["USER", "ADMIN", "SUPER_ADMIN"] : ["USER"],
    [currentUser?.role]
  );

  async function refresh() {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { users?: UserDto[]; currentUser?: UserDto; error?: string };
    if (!response.ok) {
      setMessage(data.error || "读取用户失败。");
      setLoading(false);
      return;
    }
    setUsers(data.users || []);
    setCurrentUser(data.currentUser || null);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, []);

  async function request(path: string, method: string, body?: unknown) {
    setMessage("");
    setGeneratedPassword("");
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({})) as { error?: string; password?: string };
    if (!response.ok) {
      setMessage(data.error || "操作失败。");
      return null;
    }
    if (data.password) setGeneratedPassword(data.password);
    await refresh();
    setMessage("操作完成。");
    return data;
  }

  async function createUser() {
    if (!username.trim() || !displayName.trim()) {
      setMessage("请输入用户名和显示名。");
      return;
    }
    const result = await request("/api/admin/users", "POST", { username, displayName, role });
    if (result) {
      setUsername("");
      setDisplayName("");
      setRole("USER");
    }
  }

  function canManage(user: UserDto) {
    if (!currentUser || user.id === currentUser.id) return false;
    if (currentUser.role === "SUPER_ADMIN") return true;
    return currentUser.role === "ADMIN" && user.role === "USER";
  }

  return (
    <div className="space-y-4">
      <Panel className="grid gap-3 lg:grid-cols-[180px_180px_160px_auto]">
        <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="用户名" />
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="显示名" />
        <Select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
          {creatableRoles.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}
        </Select>
        <Button onClick={createUser}>
          <UserPlus className="mr-1 h-4 w-4" /> 新增用户
        </Button>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn(skin.typography.meta, "text-muted-foreground")}>{loading ? "正在加载..." : `共 ${users.length} 个账号`}</p>
        <div className="flex flex-wrap items-center gap-2">
          {message ? <span className={skin.typography.meta}>{message}</span> : null}
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> 刷新
          </Button>
        </div>
      </div>

      {generatedPassword ? (
        <Surface tone="muted" className="border-amber-200 bg-amber-50 text-amber-900">
          <p className="font-semibold">临时密码：{generatedPassword}</p>
          <p className={cn("mt-1", skin.typography.meta)}>请立即交给对应用户；离开页面后不会再次显示。</p>
        </Surface>
      ) : null}

      <div className="overflow-hidden rounded-[var(--skin-radius-panel)] border bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">用户名</th>
              <th className="px-3 py-2 text-left">显示名</th>
              <th className="px-3 py-2 text-left">角色</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-3 py-2 font-semibold">{user.username}</td>
                <td className="px-3 py-2">{user.displayName}</td>
                <td className="px-3 py-2">{roleLabels[user.role]}</td>
                <td className="px-3 py-2">
                  <StatusPill tone={user.status === "ACTIVE" ? "success" : "neutral"}>{user.status === "ACTIVE" ? "启用" : "停用"}</StatusPill>
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" disabled={!canManage(user)} onClick={() => request(`/api/admin/users/${user.id}`, "PATCH", { resetPassword: true })}>重置密码</Button>
                    {user.status === "ACTIVE" ? (
                      <Button variant="secondary" size="sm" disabled={!canManage(user)} onClick={() => request(`/api/admin/users/${user.id}`, "DELETE")}>停用</Button>
                    ) : (
                      <Button variant="secondary" size="sm" disabled={!canManage(user)} onClick={() => request(`/api/admin/users/${user.id}`, "PATCH", { status: "ACTIVE" })}>启用</Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

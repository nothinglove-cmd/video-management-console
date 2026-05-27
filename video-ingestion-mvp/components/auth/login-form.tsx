"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function LoginForm() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/admin";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        user?: { mustChangePassword?: boolean };
      };
      if (!response.ok) throw new Error(data.error || "登录失败。");
      router.replace(data.user?.mustChangePassword ? "/change-password" : next.startsWith("/") ? next : "/admin");
      router.refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Surface tone="raised" className="mx-auto w-full max-w-sm">
      <div className="mb-5">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--skin-radius-control)] bg-primary text-primary-foreground">
          <LogIn className="h-4 w-4" />
        </div>
        <h1 className={skin.typography.pageTitle}>登录</h1>
        <p className={cn("mt-2", skin.typography.body, "text-muted-foreground")}>使用本地账号进入素材管理系统。</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className={skin.typography.label}>用户名</span>
          <Input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label className="block space-y-1.5">
          <span className={skin.typography.label}>密码</span>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
          />
        </label>
        {error ? <p className={cn("text-red-700", skin.typography.meta)}>{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "登录中..." : "登录"}
        </Button>
      </form>
    </Surface>
  );
}

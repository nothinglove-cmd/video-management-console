"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/ui/surface";
import { skin } from "@/components/theme/skin";
import { cn } from "@/lib/utils";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "修改密码失败。");
      router.replace("/admin");
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
          <KeyRound className="h-4 w-4" />
        </div>
        <h1 className={skin.typography.pageTitle}>修改初始密码</h1>
        <p className={cn("mt-2", skin.typography.body, "text-muted-foreground")}>首次登录或重置密码后，需要先设置一个新密码。</p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className={skin.typography.label}>当前密码</span>
          <Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </label>
        <label className="block space-y-1.5">
          <span className={skin.typography.label}>新密码</span>
          <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </label>
        <label className="block space-y-1.5">
          <span className={skin.typography.label}>确认新密码</span>
          <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
        </label>
        {error ? <p className={cn("text-red-700", skin.typography.meta)}>{error}</p> : null}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "保存中..." : "保存新密码"}
        </Button>
      </form>
    </Surface>
  );
}

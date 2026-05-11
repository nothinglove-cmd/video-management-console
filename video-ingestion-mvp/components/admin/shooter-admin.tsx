"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ShooterDto = {
  id: string;
  name: string;
  displayName: string;
  status: "ACTIVE" | "DISABLED" | "DELETED";
  notes?: string | null;
  createdAt: string;
};

export function ShooterAdmin() {
  const [shooters, setShooters] = useState<ShooterDto[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ShooterDto | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [deleting, setDeleting] = useState<ShooterDto | null>(null);

  async function refresh() {
    setLoading(true);
    const response = await fetch("/api/shooters", { cache: "no-store" });
    const data = (await response.json()) as { shooters: ShooterDto[] };
    setShooters(data.shooters);
    setLoading(false);
  }

  useEffect(() => {
    refresh().catch((error) => {
      setMessage(error.message);
      setLoading(false);
    });
  }, []);

  async function post(path: string, body?: unknown, method = "POST") {
    setMessage("");
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(data.error || "操作失败。");
      return null;
    }
    await refresh();
    setMessage("操作完成。");
    return data;
  }

  async function create() {
    if (!name.trim()) {
      setMessage("请输入拍摄人名称。");
      return;
    }
    const result = await post("/api/shooters", { name, displayName: name, notes });
    if (result) {
      setName("");
      setNotes("");
    }
  }

  function edit(shooter: ShooterDto) {
    setEditing(shooter);
    setEditName(shooter.displayName || shooter.name);
    setEditNotes(shooter.notes || "");
  }

  async function saveEdit() {
    if (!editing || !editName.trim()) return;
    await post(`/api/shooters/${editing.id}`, { name: editName, displayName: editName, notes: editNotes }, "PATCH");
    setEditing(null);
  }

  async function setStatus(shooter: ShooterDto, status: ShooterDto["status"]) {
    await post(`/api/shooters/${shooter.id}`, { status }, "PATCH");
  }

  async function remove(shooter: ShooterDto) {
    setDeleting(shooter);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[220px_1fr_auto]">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="拍摄人名称，例如 阿阳" />
          <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="备注，可选" />
          <Button onClick={create}>
            <Plus className="mr-1 h-4 w-4" /> 新增
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{loading ? "正在加载..." : `共 ${shooters.length} 位拍摄人`}</span>
        <div className="flex items-center gap-2">
          {message ? <span className="text-primary">{message}</span> : null}
          <Button variant="secondary" size="sm" onClick={refresh}>
            <RefreshCcw className="mr-1 h-3.5 w-3.5" /> 刷新
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">名称</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">备注</th>
              <th className="px-3 py-2 text-left">创建时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shooters.map((shooter) => (
              <tr key={shooter.id}>
                <td className="px-3 py-2 font-semibold">{shooter.displayName || shooter.name}</td>
                <td className="px-3 py-2">{shooter.status}</td>
                <td className="max-w-[360px] truncate px-3 py-2 text-muted-foreground">{shooter.notes || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{new Date(shooter.createdAt).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => edit(shooter)}>编辑</Button>
                    {shooter.status === "ACTIVE" ? (
                      <Button variant="secondary" size="sm" onClick={() => setStatus(shooter, "DISABLED")}>停用</Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setStatus(shooter, "ACTIVE")}>启用</Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={() => remove(shooter)}>删除</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-white shadow-2xl">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">编辑拍摄人</h2>
            </div>
            <div className="space-y-3 p-5">
              <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="拍摄人名称" />
              <Textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder="备注" />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>取消</Button>
                <Button onClick={saveEdit}>保存</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {deleting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-white shadow-2xl">
            <div className="border-b px-5 py-4">
              <h2 className="font-semibold">删除拍摄人</h2>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted-foreground">确认软删除拍摄人：{deleting.displayName || deleting.name}？历史素材仍会保留拍摄人名称。</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button>
                <Button variant="destructive" onClick={async () => {
                  await post(`/api/shooters/${deleting.id}`, undefined, "DELETE");
                  setDeleting(null);
                }}>删除</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

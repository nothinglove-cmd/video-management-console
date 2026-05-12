"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Database, FolderCheck, RefreshCcw, Save, SearchCheck } from "lucide-react";

import { skin, type SkinStatusTone } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusPill } from "@/components/ui/status-pill";
import { Panel, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type StorageRootSource = "db" | "env";

type StorageRootStatus = {
  rootPath: string;
  source: StorageRootSource;
  envRootPath: string;
  workspace: {
    id: string;
    code: string;
    name: string;
    storageRoot: string | null;
  } | null;
  storageProvider: {
    id: string;
    code: string;
    name: string;
    type: string;
    rootPath: string | null;
    status: string;
  } | null;
  materialCount: number;
  derivativeFileCount: number;
  notes: string[];
};

type StorageRootCheckResult = {
  ok: boolean;
  rootPath: string;
  resolvedRootPath: string | null;
  errors: string[];
  warnings: string[];
  requiredDirectories: Array<{
    relativePath: string;
    exists: boolean;
    isDirectory: boolean;
  }>;
  materialFileCheck: {
    totalMaterials: number;
    checkedMaterials: number;
    existingFiles: number;
    missingFiles: number;
    sampleMissingPaths: string[];
  };
};

type ApplyStorageRootResult = {
  oldRoot: string;
  newRoot: string;
  materialUpdatedCount: number;
  derivativeUpdatedCount: number;
  checkResult: StorageRootCheckResult;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T | null;
  errors?: string[];
  warnings?: string[];
  checkResult?: StorageRootCheckResult | null;
};

export function StorageRootPanel() {
  const [status, setStatus] = useState<StorageRootStatus | null>(null);
  const [inputRoot, setInputRoot] = useState("");
  const [checkedRoot, setCheckedRoot] = useState("");
  const [checkResult, setCheckResult] = useState<StorageRootCheckResult | null>(null);
  const [saveResult, setSaveResult] = useState<ApplyStorageRootResult | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"load" | "check" | "save" | "">("");

  useEffect(() => {
    void loadStatus();
  }, []);

  const trimmedInput = inputRoot.trim();
  const canSave = Boolean(trimmedInput) && checkResult?.ok === true && checkedRoot === trimmedInput;

  const permissionErrors = useMemo(() => {
    return checkResult?.errors.filter((item) => item.includes("权限") || item.includes("写入") || item.includes("读取")) ?? [];
  }, [checkResult]);

  async function loadStatus() {
    setBusy("load");
    setError("");
    const response = await fetch("/api/admin/storage-root", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as ApiEnvelope<StorageRootStatus> | null;
    setBusy("");
    if (!response.ok || !payload?.success || !payload.data) {
      setError(payload?.errors?.join("；") || payload?.message || "读取存储根目录配置失败。");
      return;
    }
    setStatus(payload.data);
    setMessage(payload.message);
  }

  async function checkPath() {
    if (!trimmedInput) {
      setError("请先输入新的存储根目录。");
      return;
    }
    setBusy("check");
    setError("");
    setMessage("");
    setSaveResult(null);
    const response = await fetch("/api/admin/storage-root/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootPath: trimmedInput })
    });
    const payload = await response.json().catch(() => null) as ApiEnvelope<{ checkResult: StorageRootCheckResult }> | null;
    setBusy("");
    const result = payload?.checkResult ?? payload?.data?.checkResult ?? null;
    if (!result) {
      setError(payload?.errors?.join("；") || payload?.message || "路径检查失败。");
      return;
    }
    setCheckResult(result);
    setCheckedRoot(trimmedInput);
    setMessage(payload?.message || (result.ok ? "存储根目录检查通过。" : "存储根目录检查未通过。"));
  }

  async function saveRoot() {
    if (!trimmedInput) {
      setError("请先输入新的存储根目录。");
      return;
    }
    if (!canSave) {
      setError("请先检查路径，且检查通过后再保存。");
      return;
    }
    const confirmed = window.confirm(
      "这不会移动或复制任何文件，只会把系统根目录切换到新路径，并重算数据库中的 absolutePath。请确认你已经手动复制或挂载了完整素材目录。"
    );
    if (!confirmed) return;

    setBusy("save");
    setError("");
    setMessage("");
    setSaveResult(null);
    const response = await fetch("/api/admin/storage-root", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rootPath: trimmedInput })
    });
    const payload = await response.json().catch(() => null) as ApiEnvelope<ApplyStorageRootResult> | null;
    setBusy("");
    if (!response.ok || !payload?.success || !payload.data) {
      setError(payload?.errors?.join("；") || payload?.message || "保存存储根目录失败。");
      if (payload?.checkResult) {
        setCheckResult(payload.checkResult);
        setCheckedRoot(trimmedInput);
      }
      return;
    }
    setSaveResult(payload.data);
    setMessage("已保存新的存储根目录。建议立即运行存储巡检 repair scan。");
    await loadStatus();
  }

  function onInputChange(value: string) {
    setInputRoot(value);
    setCheckResult(null);
    setCheckedRoot("");
    setSaveResult(null);
    setError("");
    setMessage("");
  }

  return (
    <Panel padding="none" className="overflow-hidden" style={skin.vars}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--skin-border-subtle)] px-4 py-3">
        <div>
          <p className={skin.typography.sectionTitle}>存储根目录</p>
          <p className={cn("mt-1", skin.typography.meta)}>后台配置本地目录或已挂载 NAS 路径</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={status?.source === "db" ? "success" : "neutral"} withDot>
            {sourceLabel(status?.source)}
          </StatusPill>
          <Button variant="secondary" className="min-h-10" onClick={loadStatus} disabled={Boolean(busy)}>
            <RefreshCcw className="mr-2 h-4 w-4" /> 重新读取
          </Button>
        </div>
      </div>

      <div className={cn("space-y-3 p-[var(--skin-panel-padding)]", skin.typography.body)}>
        <Surface tone="muted" padding="sm" className={cn("space-y-2 border-amber-200 bg-amber-50/70 text-amber-950", skin.typography.bodyDense)}>
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> 安全边界
          </div>
          <p>
            V1 支持本地目录或已挂载成本地路径的 NAS。SMB/WebDAV 请先在系统层挂载，例如 /Volumes/video-storage；不支持直接填写 smb://、webdav://、http://。
          </p>
          <p>
            保存不会删除旧目录，不会复制或迁移素材，不会修改 relativePath；只会更新 rootPath 并重算 absolutePath。切换后应运行存储巡检确认文件存在性。
          </p>
        </Surface>

        {error ? <Message tone="danger" text={error} /> : null}
        {message ? <Message tone={message.includes("未通过") ? "warning" : "success"} text={message} /> : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <Info label="当前有效存储根目录" value={status?.rootPath || (busy === "load" ? "读取中..." : "未读取")} />
          <Info label="来源" value={sourceLabel(status?.source)} />
          <Info label=".env fallback root" value={status?.envRootPath || "未读取"} />
          <Info label="StorageProvider code" value={status?.storageProvider?.code || "缺失"} />
          <Info label="StorageProvider name" value={status?.storageProvider?.name || "缺失"} />
          <Info label="StorageProvider type/status" value={status?.storageProvider ? `${status.storageProvider.type} / ${status.storageProvider.status}` : "缺失"} />
          <Info label="StorageProvider rootPath" value={status?.storageProvider?.rootPath || "未配置"} />
          <Info label="Material 记录" value={String(status?.materialCount ?? "-")} />
          <Info label="DerivativeFile 记录" value={String(status?.derivativeFileCount ?? "-")} />
        </div>

        <Surface tone="muted" padding="sm" className="space-y-3">
          <label className={cn("block space-y-1.5 font-medium", skin.typography.body)}>
            <span className={skin.typography.label}>新的存储根目录</span>
            <input
              value={inputRoot}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder="例如 /Volumes/video-storage"
              className={cn("min-h-10 w-full rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border)] bg-white px-3 py-2 outline-none focus:border-primary", skin.typography.body)}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="min-h-10" onClick={() => onInputChange(status?.rootPath || "")} disabled={!status?.rootPath || Boolean(busy)}>
              填入当前 root
            </Button>
            <Button variant="secondary" className="min-h-10" onClick={checkPath} disabled={!trimmedInput || Boolean(busy)}>
              <SearchCheck className="mr-2 h-4 w-4" /> {busy === "check" ? "检查中..." : "检查路径"}
            </Button>
            <Button className="min-h-10" onClick={saveRoot} disabled={!trimmedInput || !canSave || Boolean(busy)}>
              <Save className="mr-2 h-4 w-4" /> {busy === "save" ? "保存中..." : "保存为当前存储根目录"}
            </Button>
          </div>
        </Surface>

        {checkResult ? (
          <CheckResultView checkResult={checkResult} permissionErrors={permissionErrors} />
        ) : null}

        {saveResult ? (
          <Surface tone="muted" padding="sm" className={cn("space-y-3 border-emerald-200 bg-emerald-50/70 text-emerald-950", skin.typography.body)}>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="success" withDot>已保存</StatusPill>
              <StatusPill tone="info">建议立即运行 repair scan</StatusPill>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Info label="旧 root" value={saveResult.oldRoot} />
              <Info label="新 root" value={saveResult.newRoot} />
              <Info label="Material absolutePath 更新" value={String(saveResult.materialUpdatedCount)} />
              <Info label="DerivativeFile absolutePath 更新" value={String(saveResult.derivativeUpdatedCount)} />
            </div>
          </Surface>
        ) : null}
      </div>
    </Panel>
  );
}

function CheckResultView({
  checkResult,
  permissionErrors
}: {
  checkResult: StorageRootCheckResult;
  permissionErrors: string[];
}) {
  const missingDirectories = checkResult.requiredDirectories.filter((item) => !item.exists || !item.isDirectory);
  return (
    <Surface tone="muted" padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={skin.typography.sectionTitle}>检查结果</p>
          <p className={cn("mt-1 break-all text-muted-foreground", skin.typography.meta)}>
            {checkResult.resolvedRootPath || checkResult.rootPath}
          </p>
        </div>
        <StatusPill tone={checkResult.ok ? "success" : "danger"} withDot>
          {checkResult.ok ? "通过" : "未通过"}
        </StatusPill>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CheckBlock title="基础路径检查" ok={checkResult.errors.length === 0} items={checkResult.errors.length ? checkResult.errors : ["路径格式、危险路径和目录存在性检查通过。"]} />
        <CheckBlock title="读写权限" ok={permissionErrors.length === 0 && checkResult.errors.length === 0} items={permissionErrors.length ? permissionErrors : ["目录读写和临时文件测试未发现错误。"]} />
        <CheckBlock
          title="标准目录"
          ok={missingDirectories.length === 0}
          items={
            checkResult.requiredDirectories.length
              ? checkResult.requiredDirectories.map((item) => `${item.relativePath}：${item.exists && item.isDirectory ? "存在" : "缺失或不是目录"}`)
              : ["路径检查未进入标准目录检查。"]
          }
        />
        <CheckBlock title="警告" ok={checkResult.warnings.length === 0} items={checkResult.warnings.length ? checkResult.warnings : ["暂无警告。"]} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="素材总数" value={checkResult.materialFileCheck.totalMaterials} icon={Database} />
        <MetricCard label="已检查" value={checkResult.materialFileCheck.checkedMaterials} icon={SearchCheck} />
        <MetricCard label="文件存在" value={checkResult.materialFileCheck.existingFiles} icon={CheckCircle2} tone="success" />
        <MetricCard label="文件缺失" value={checkResult.materialFileCheck.missingFiles} icon={AlertTriangle} tone={checkResult.materialFileCheck.missingFiles > 0 ? "warning" : "neutral"} />
      </div>

      {checkResult.materialFileCheck.sampleMissingPaths.length > 0 ? (
        <Surface tone="muted" padding="sm" className={cn("max-h-44 overflow-auto border-amber-200 bg-amber-50/70 text-amber-950", skin.typography.path)}>
          <p className={cn("mb-2 font-semibold", skin.typography.label)}>缺失样例</p>
          {checkResult.materialFileCheck.sampleMissingPaths.map((item) => (
            <p key={item} className="break-all">{item}</p>
          ))}
        </Surface>
      ) : null}
    </Surface>
  );
}

function CheckBlock({ title, ok, items }: { title: string; ok: boolean; items: string[] }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={cn("font-semibold", skin.typography.label)}>{title}</p>
        <StatusPill tone={ok ? "success" : "warning"}>{ok ? "OK" : "检查"}</StatusPill>
      </div>
      <div className={cn("space-y-1 text-muted-foreground", skin.typography.meta)}>
        {items.map((item) => (
          <p key={item} className="break-all">{item}</p>
        ))}
      </div>
    </Surface>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <Surface tone="muted" padding="sm" className="min-w-0">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{value}</p>
    </Surface>
  );
}

function Message({ tone, text }: { tone: SkinStatusTone; text: string }) {
  return (
    <Surface tone="muted" padding="sm" className={cn(messageClassName(tone), skin.typography.bodyDense)}>
      <StatusPill tone={tone}>{tone === "danger" ? "错误" : tone === "warning" ? "提示" : "成功"}</StatusPill>
      <p className="mt-2 break-words">{text}</p>
    </Surface>
  );
}

function messageClassName(tone: SkinStatusTone) {
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function sourceLabel(source?: StorageRootSource) {
  if (source === "db") return "后台保存配置";
  if (source === "env") return ".env STORAGE_ROOT";
  return "读取中";
}

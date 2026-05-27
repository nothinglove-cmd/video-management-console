"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import {
  AI_IMAGE_DETAILS,
  AI_PROVIDER_PRESETS,
  AI_PROVIDERS,
  type AiProvider,
  type ImageDetail
} from "@/components/settings/ai-provider-presets";
import { skin } from "@/components/theme/skin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatusPill } from "@/components/ui/status-pill";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

type PublicAiConfig = {
  source: "db" | "env";
  dbConfigId: string | null;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  volcengineBaseUrl: string;
  localBaseUrl: string;
  localModel: string;
  localHealthcheckUrl: string;
  fallbackProvider: AiProvider;
  frameMax: number;
  imageDetail: ImageDetail;
  requestTimeoutMs: number;
  openaiProxyUrl: string;
  volcengineProxyUrl: string;
  openaiApiKeyConfigured: boolean;
  arkApiKeyConfigured: boolean;
  localApiKeyConfigured: boolean;
};

type PublicDbConfig = Omit<PublicAiConfig, "source" | "dbConfigId"> & {
  id: string;
  name: string;
  workspaceId: string | null;
  isActive: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type ConfigOverview = PublicAiConfig & {
  currentConfig: PublicAiConfig;
  configs: PublicDbConfig[];
};

type FormState = Omit<
  PublicDbConfig,
  "id" | "workspaceId" | "isActive" | "status" | "createdAt" | "updatedAt" | "openaiApiKeyConfigured" | "arkApiKeyConfigured" | "localApiKeyConfigured"
> & {
  openaiApiKey: string;
  arkApiKey: string;
  localApiKey: string;
  clearOpenaiApiKey: boolean;
  clearArkApiKey: boolean;
  clearLocalApiKey: boolean;
  presetNotice: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "ready"; overview: ConfigOverview }
  | { status: "error"; message: string };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type TestState =
  | { status: "idle" }
  | { status: "testing"; id: string }
  | { status: "success" | "error"; id: string; message: string; diagnostics?: Record<string, unknown> };

type PanelMessage =
  | { tone: "info" | "success" | "error"; message: string }
  | null;

type EditorMode = "env" | "new" | "edit";

const DEFAULT_FORM: FormState = {
  name: "新的 AI 配置",
  provider: "mock",
  model: "",
  baseUrl: "",
  volcengineBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
  localBaseUrl: "",
  localModel: "",
  localHealthcheckUrl: "",
  fallbackProvider: "mock",
  frameMax: 5,
  imageDetail: "low",
  requestTimeoutMs: 60000,
  openaiProxyUrl: "",
  volcengineProxyUrl: "",
  openaiApiKey: "",
  arkApiKey: "",
  localApiKey: "",
  clearOpenaiApiKey: false,
  clearArkApiKey: false,
  clearLocalApiKey: false,
  presetNotice: ""
};

function providerLabel(provider: AiProvider) {
  return AI_PROVIDER_PRESETS[provider].label;
}

function isLocalProvider(provider: AiProvider) {
  return provider === "local_ollama" || provider === "local_openai_compatible";
}

function displayModel(config: Pick<PublicDbConfig | PublicAiConfig | FormState, "provider" | "model" | "localModel">) {
  if (isLocalProvider(config.provider)) return config.localModel || config.model || "-";
  return config.model || "-";
}

function modelSummaryLabel(provider: AiProvider) {
  if (provider === "volcengine") return "Endpoint";
  if (provider === "local_openai_compatible") return "中转站模型";
  if (isLocalProvider(provider)) return "本地模型";
  return "模型";
}

function keyConfigured(config: Pick<PublicDbConfig | PublicAiConfig, "provider" | "openaiApiKeyConfigured" | "arkApiKeyConfigured" | "localApiKeyConfigured">) {
  if (config.provider === "openai") return config.openaiApiKeyConfigured;
  if (config.provider === "volcengine") return config.arkApiKeyConfigured;
  if (config.provider === "local_openai_compatible") return config.localApiKeyConfigured;
  return null;
}

function keyStatusText(config: Pick<PublicDbConfig | PublicAiConfig, "provider" | "openaiApiKeyConfigured" | "arkApiKeyConfigured" | "localApiKeyConfigured">) {
  const configured = keyConfigured(config);
  if (configured === null) return "不需要 Key";
  return configured ? "Key 已配置" : "Key 未配置";
}

function toFormFromCurrent(config: PublicAiConfig): FormState {
  return {
    ...DEFAULT_FORM,
    name: `${providerLabel(config.provider)} 配置`,
    provider: config.provider,
    model: config.model || "",
    baseUrl: config.baseUrl || "",
    volcengineBaseUrl: config.volcengineBaseUrl || "",
    localBaseUrl: config.localBaseUrl || "",
    localModel: config.localModel || "",
    localHealthcheckUrl: config.localHealthcheckUrl || "",
    fallbackProvider: config.fallbackProvider,
    frameMax: config.frameMax || 5,
    imageDetail: config.imageDetail || "low",
    requestTimeoutMs: config.requestTimeoutMs || 60000,
    openaiProxyUrl: config.openaiProxyUrl || "",
    volcengineProxyUrl: config.volcengineProxyUrl || ""
  };
}

function toFormFromDb(config: PublicDbConfig): FormState {
  return {
    ...toFormFromCurrent({ ...config, source: "db", dbConfigId: config.id }),
    name: config.name
  };
}

function isPresetModel(provider: AiProvider, model: string) {
  const trimmed = model.trim();
  if (!trimmed) return true;
  const preset = AI_PROVIDER_PRESETS[provider];
  return preset.defaults.model === trimmed || preset.recommendedModels.includes(trimmed);
}

function applyProviderPreset(current: FormState, nextProvider: AiProvider): FormState {
  const previousProvider = current.provider;
  const preset = AI_PROVIDER_PRESETS[nextProvider];
  const previousModel = current.model || current.localModel || "";
  const shouldReplaceModel = !previousModel.trim() || isPresetModel(previousProvider, previousModel);
  const nextDefaultModel = preset.defaults.model || "";
  const nextModel = shouldReplaceModel ? nextDefaultModel : current.model;
  const nextLocalModel = shouldReplaceModel && isLocalProvider(nextProvider) ? nextDefaultModel : current.localModel;

  return {
    ...current,
    provider: nextProvider,
    ...preset.defaults,
    model: nextProvider === "mock" ? "" : nextModel,
    localModel: nextProvider === "mock" ? current.localModel : nextLocalModel,
    clearOpenaiApiKey: false,
    clearArkApiKey: false,
    clearLocalApiKey: false,
    presetNotice: `已应用 ${preset.label} 默认地址和识别参数。`
  };
}

function currentModel(form: FormState) {
  if (isLocalProvider(form.provider)) return form.localModel || form.model;
  return form.model;
}

function setCurrentModel(form: FormState, value: string): FormState {
  if (isLocalProvider(form.provider)) return { ...form, model: value, localModel: value };
  return { ...form, model: value };
}

function currentKeyMeta(provider: AiProvider, config: PublicDbConfig | PublicAiConfig | null) {
  if (provider === "openai") {
    return { field: "openaiApiKey" as const, clearField: "clearOpenaiApiKey" as const, configured: Boolean(config?.openaiApiKeyConfigured), label: "OpenAI API Key", optional: false };
  }
  if (provider === "volcengine") {
    return { field: "arkApiKey" as const, clearField: "clearArkApiKey" as const, configured: Boolean(config?.arkApiKeyConfigured), label: "Ark API Key", optional: false };
  }
  if (provider === "local_openai_compatible") {
    return { field: "localApiKey" as const, clearField: "clearLocalApiKey" as const, configured: Boolean(config?.localApiKeyConfigured), label: "中转站 API Key", optional: false };
  }
  return null;
}

function activeConfigId(overview: ConfigOverview) {
  return overview.currentConfig.dbConfigId || overview.configs.find((config) => config.isActive)?.id || null;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

export function AiProviderConfigPanel() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const [testState, setTestState] = useState<TestState>({ status: "idle" });
  const [panelMessage, setPanelMessage] = useState<PanelMessage>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isNewProfile, setIsNewProfile] = useState(true);
  const [editorMode, setEditorMode] = useState<EditorMode>("new");
  const [activateAfterSave, setActivateAfterSave] = useState(true);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const overview = loadState.status === "ready" ? loadState.overview : null;
  const currentConfig = overview?.currentConfig ?? null;
  const activeId = overview ? activeConfigId(overview) : null;
  const editingConfig = editingId && overview ? overview.configs.find((config) => config.id === editingId) || null : null;
  const keySource = editorMode === "edit" ? editingConfig : editorMode === "env" ? currentConfig : null;
  const activeKey = currentKeyMeta(form.provider, keySource);
  const preset = AI_PROVIDER_PRESETS[form.provider];
  const showModel = form.provider !== "mock" && form.provider !== "local";
  const modelInputId = `ai-model-options-${form.provider}`;
  const sourceMessage = currentConfig?.source === "db"
    ? "当前使用后台保存配置。"
    : "当前使用 .env 配置，可保存为后台配置覆盖。";

  const requestPayload = useMemo(() => ({
    name: form.name,
    provider: form.provider,
    model: form.model,
    baseUrl: form.baseUrl,
    volcengineBaseUrl: form.volcengineBaseUrl,
    localBaseUrl: form.localBaseUrl,
    localModel: form.localModel,
    localHealthcheckUrl: form.localHealthcheckUrl,
    fallbackProvider: form.fallbackProvider,
    frameMax: form.frameMax,
    imageDetail: form.imageDetail,
    requestTimeoutMs: form.requestTimeoutMs,
    openaiProxyUrl: form.openaiProxyUrl,
    volcengineProxyUrl: form.volcengineProxyUrl,
    openaiApiKey: form.openaiApiKey,
    arkApiKey: form.arkApiKey,
    localApiKey: form.localApiKey,
    clearOpenaiApiKey: form.clearOpenaiApiKey,
    clearArkApiKey: form.clearArkApiKey,
    clearLocalApiKey: form.clearLocalApiKey,
    activate: activateAfterSave
  }), [activateAfterSave, form]);

  function scrollToEditor() {
    window.setTimeout(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function loadConfig(preferredConfigId?: string | null) {
    setLoadState({ status: "loading" });
    try {
      const response = await fetch("/api/ai/config", { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(String(data.message || "读取 AI 配置失败。"));
      const nextOverview = data as unknown as ConfigOverview;
      setLoadState({ status: "ready", overview: nextOverview });
      const selected =
        (preferredConfigId ? nextOverview.configs.find((config) => config.id === preferredConfigId) : null) ||
        nextOverview.configs.find((config) => config.id === nextOverview.currentConfig.dbConfigId) ||
        null;
      if (selected) {
        setEditingId(selected.id);
        setIsNewProfile(false);
        setEditorMode("edit");
        setActivateAfterSave(selected.isActive);
        setForm(toFormFromDb(selected));
      } else {
        setEditingId(null);
        setIsNewProfile(true);
        setEditorMode("new");
        setActivateAfterSave(true);
        setForm(toFormFromCurrent(nextOverview.currentConfig));
      }
    } catch (error) {
      setLoadState({ status: "error", message: `读取 AI 配置失败：${(error as Error).message}` });
    }
  }

  useEffect(() => {
    void loadConfig();
  }, []);

  function editExisting(config: PublicDbConfig) {
    setEditorOpen(true);
    setEditingId(config.id);
    setIsNewProfile(false);
    setEditorMode("edit");
    setActivateAfterSave(config.isActive || activeId === config.id);
    setAdvancedOpen(false);
    setSaveState({ status: "idle" });
    setPanelMessage({ tone: "info", message: `正在编辑配置档案“${config.name}”。修改后需要保存才会生效。` });
    setForm(toFormFromDb(config));
    scrollToEditor();
  }

  function startFromEnv(source: PublicAiConfig) {
    setEditorOpen(true);
    setEditingId(null);
    setIsNewProfile(true);
    setEditorMode("env");
    setActivateAfterSave(true);
    setAdvancedOpen(false);
    setSaveState({ status: "idle" });
    setPanelMessage({ tone: "info", message: "已从 .env 载入配置，请确认名称和密钥后保存。" });
    setForm(toFormFromCurrent(source));
    scrollToEditor();
  }

  function startBlankProfile() {
    setEditorOpen(true);
    setEditingId(null);
    setIsNewProfile(true);
    setEditorMode("new");
    setActivateAfterSave(!overview?.configs.length);
    setAdvancedOpen(false);
    setSaveState({ status: "idle" });
    setPanelMessage({ tone: "info", message: "正在新建配置档案，保存后才会生效。" });
    setForm(DEFAULT_FORM);
    scrollToEditor();
  }

  async function saveConfig() {
    setSaveState({ status: "saving" });
    setPanelMessage({ tone: "info", message: "正在保存 AI Provider 配置档案..." });
    try {
      const response = await fetch(isNewProfile ? "/api/ai/config" : `/api/ai/config/${editingId}`, {
        method: isNewProfile ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(String(data.message || "保存 AI 配置失败。"));
      const savedId = typeof (data.currentConfig as { dbConfigId?: unknown } | undefined)?.dbConfigId === "string"
        ? (data.currentConfig as { dbConfigId: string }).dbConfigId
        : null;
      const message = activateAfterSave
        ? "已保存并设为当前 AI 配置。"
        : "已保存配置档案，当前使用配置未改变。";
      setSaveState({ status: "success", message });
      setPanelMessage({ tone: "success", message });
      await loadConfig(savedId);
      setEditorOpen(false);
      setAdvancedOpen(false);
    } catch (error) {
      const message = `保存 AI 配置失败：${(error as Error).message}`;
      setSaveState({ status: "error", message });
      setPanelMessage({ tone: "error", message });
    }
  }

  async function activateConfig(config: PublicDbConfig) {
    setSaveState({ status: "saving" });
    setPanelMessage({ tone: "info", message: `正在切换当前 AI 配置为“${config.name}”...` });
    try {
      const response = await fetch(`/api/ai/config/${config.id}/activate`, { method: "POST" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(String(data.message || "设为当前使用失败。"));
      const message = `已切换为“${config.name}”，后续 AI 入库识别将使用该配置。`;
      setSaveState({ status: "success", message });
      setPanelMessage({ tone: "success", message });
      await loadConfig(config.id);
    } catch (error) {
      const message = `设为当前使用失败：${(error as Error).message}`;
      setSaveState({ status: "error", message });
      setPanelMessage({ tone: "error", message });
    }
  }

  async function deleteConfig(config: PublicDbConfig) {
    if (config.id === activeId || config.isActive) return;
    if (!window.confirm(`删除配置“${config.name}”？API Key 不会回显，删除后只能重新录入。`)) return;
    setSaveState({ status: "saving" });
    setPanelMessage({ tone: "info", message: `正在删除配置档案“${config.name}”...` });
    try {
      const response = await fetch(`/api/ai/config/${config.id}`, { method: "DELETE" });
      const data = await readJson(response);
      if (!response.ok) throw new Error(String(data.message || "删除 AI 配置失败。"));
      const message = `已删除配置档案“${config.name}”。`;
      setSaveState({ status: "success", message });
      setPanelMessage({ tone: "success", message });
      await loadConfig();
    } catch (error) {
      const message = `删除 AI 配置失败：${(error as Error).message}`;
      setSaveState({ status: "error", message });
      setPanelMessage({ tone: "error", message });
    }
  }

  async function testConnection(id: string, configId?: string) {
    setTestState({ status: "testing", id });
    setPanelMessage({ tone: "info", message: "正在测试 AI Provider 连接..." });
    try {
      const response = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configId ? { configId } : {})
      });
      const data = await readJson(response);
      const ok = response.ok && data.ok;
      const message = String(data.message || (response.ok ? "测试完成。" : "测试失败。"));
      const diagnostics = typeof data.diagnostics === "object" && data.diagnostics !== null
        ? (data.diagnostics as Record<string, unknown>)
        : undefined;
      setTestState({
        status: ok ? "success" : "error",
        id,
        message,
        diagnostics
      });
      const endpoint = typeof diagnostics?.endpoint === "string" ? ` endpoint=${diagnostics.endpoint}` : "";
      const baseUrl = typeof diagnostics?.baseUrl === "string" ? ` baseUrl=${diagnostics.baseUrl}` : "";
      setPanelMessage({ tone: ok ? "success" : "error", message: ok ? `测试连接成功：${message}` : `测试连接失败：${message}${baseUrl}${endpoint}` });
    } catch (error) {
      const message = `请求测试接口失败：${(error as Error).message}`;
      setTestState({ status: "error", id, message });
      setPanelMessage({ tone: "error", message });
    }
  }

  const editorTitle = editorMode === "env"
    ? "从 .env 创建配置档案"
    : isNewProfile
      ? "新建配置档案"
      : `编辑配置档案：${editingConfig?.name || form.name}`;

  return (
    <Surface tone="muted" padding="sm" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={skin.typography.sectionTitle}>AI Provider 配置档案</p>
            <StatusPill tone={currentConfig?.source === "db" ? "success" : "neutral"}>
              {loadState.status === "loading" ? "读取中" : sourceMessage}
            </StatusPill>
          </div>
          <p className={cn("mt-1", skin.typography.meta)}>
            多个 provider 可分别保存模型、Endpoint、Base URL 和密钥；入库识别只使用当前启用配置。密钥不会回显，留空不会覆盖。
          </p>
        </div>
        <Button variant="secondary" onClick={() => loadConfig()} disabled={loadState.status === "loading"}>
          重新读取
        </Button>
      </div>

      {loadState.status === "error" ? (
        <Surface tone="muted" padding="sm" className={cn("border-red-200 bg-red-50 text-red-800", skin.typography.bodyDense)}>
          {loadState.message}
        </Surface>
      ) : null}

      {panelMessage ? <PanelMessageView message={panelMessage} /> : null}

      {overview ? (
        <>
          <CurrentConfigSummary
            config={overview.currentConfig}
            activeDbConfig={overview.configs.find((config) => config.id === activeId) || null}
            testState={testState}
            onTest={() => testConnection("current")}
            onSaveEnv={() => startFromEnv(overview.currentConfig)}
          />

          <ConfigList
            configs={overview.configs}
            activeId={activeId}
            testState={testState}
            busy={saveState.status === "saving"}
            onTest={(config) => testConnection(config.id, config.id)}
            onEdit={editExisting}
            onActivate={activateConfig}
            onDelete={deleteConfig}
            onNew={startBlankProfile}
            onCreateFromEnv={() => startFromEnv(overview.currentConfig)}
          />

          {editorOpen ? (
            <div ref={editorRef} className="scroll-mt-24">
              <Surface
                tone="plain"
                padding="sm"
                className={cn(
                  "space-y-3 border border-dashed border-sky-300 bg-sky-50/60 transition-shadow",
                  panelMessage?.tone === "info" ? "ring-2 ring-sky-200" : "",
                  panelMessage?.tone === "success" ? "ring-2 ring-emerald-200" : "",
                  panelMessage?.tone === "error" ? "ring-2 ring-red-200" : ""
                )}
              >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className={skin.typography.sectionTitle}>{editorTitle}</p>
                <p className={cn("mt-1", skin.typography.meta)}>{preset.hint}</p>
              </div>
              <StatusPill tone={editorMode === "env" ? "info" : isNewProfile ? "processing" : "neutral"}>
                {editorMode === "env" ? "来自 .env" : isNewProfile ? "新建中" : "编辑中"}
              </StatusPill>
            </div>

            {form.presetNotice ? (
              <p className={cn("rounded-[var(--skin-radius-control)] bg-emerald-50 px-3 py-2 text-emerald-800", skin.typography.meta)}>
                {form.presetNotice}
              </p>
            ) : null}

            <div className={cn("grid gap-3", showModel && activeKey ? "md:grid-cols-4" : "md:grid-cols-3")}>
              <Field label="配置名称">
                <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如：火山方舟生产配置" />
              </Field>
              <Field label="AI 服务商">
                <Select value={form.provider} onChange={(event) => setForm((current) => applyProviderPreset(current, event.target.value as AiProvider))}>
                  {AI_PROVIDERS.map((provider) => (
                    <option key={provider} value={provider}>{providerLabel(provider)}</option>
                  ))}
                </Select>
              </Field>
              {showModel ? (
                <Field label={form.provider === "volcengine" ? "Endpoint ID / 模型" : form.provider === "local_openai_compatible" ? "中转站模型" : isLocalProvider(form.provider) ? "Local Model" : "模型"}>
                  <Input
                    list={preset.recommendedModels.length ? modelInputId : undefined}
                    value={currentModel(form)}
                    onChange={(event) => setForm((current) => setCurrentModel(current, event.target.value))}
                    placeholder={preset.modelPlaceholder}
                  />
                  {preset.recommendedModels.length ? (
                    <datalist id={modelInputId}>
                      {preset.recommendedModels.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  ) : null}
                </Field>
              ) : null}
              {activeKey ? (
                <SecretInput
                  label={activeKey.label}
                  optional={activeKey.optional}
                  configured={activeKey.configured}
                  value={form[activeKey.field]}
                  clear={form[activeKey.clearField]}
                  onValue={(value) => setForm((current) => ({ ...current, [activeKey.field]: value }))}
                  onClear={(value) => setForm((current) => ({ ...current, [activeKey.clearField]: value }))}
                />
              ) : null}
            </div>

            <label className={cn("flex items-center gap-2", skin.typography.meta)}>
              <input
                type="checkbox"
                checked={activateAfterSave}
                onChange={(event) => setActivateAfterSave(event.target.checked)}
              />
              保存后设为当前使用
            </label>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className={cn("flex w-full items-center justify-between rounded-[var(--skin-radius-panel)] border border-[color:var(--skin-border)] bg-[color:var(--skin-panel-bg)] px-3 py-2 text-left", skin.typography.bodyDense)}
              >
                <span className="font-medium">高级设置</span>
                <span className={skin.typography.meta}>{advancedOpen ? "收起" : "展开"}</span>
              </button>
              {advancedOpen ? <AdvancedFields form={form} activeKey={activeKey} setForm={setForm} /> : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveConfig} disabled={saveState.status === "saving" || loadState.status === "loading"}>
                {saveState.status === "saving" ? "保存中..." : "保存配置档案"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditorOpen(false);
                  setAdvancedOpen(false);
                  setSaveState({ status: "idle" });
                  setPanelMessage({ tone: "info", message: "已取消编辑，未保存任何配置变更。" });
                }}
              >
                取消
              </Button>
              {saveState.status === "success" ? (
                <StatusPill tone="success">{saveState.message}</StatusPill>
              ) : saveState.status === "error" ? (
                <StatusPill tone="danger">{saveState.message}</StatusPill>
              ) : null}
            </div>
              </Surface>
            </div>
          ) : null}
        </>
      ) : null}
    </Surface>
  );
}

function CurrentConfigSummary({
  config,
  activeDbConfig,
  testState,
  onTest,
  onSaveEnv
}: {
  config: PublicAiConfig;
  activeDbConfig: PublicDbConfig | null;
  testState: TestState;
  onTest: () => void;
  onSaveEnv: () => void;
}) {
  return (
    <Surface tone="plain" padding="sm" className="space-y-3 border border-emerald-200 bg-emerald-50/70">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className={skin.typography.sectionTitle}>当前使用配置</p>
            <StatusPill tone="success">当前使用</StatusPill>
            <StatusPill tone={config.source === "db" ? "success" : "neutral"}>{config.source === "db" ? "后台配置" : ".env"}</StatusPill>
          </div>
          <p className={cn("mt-1", skin.typography.meta)}>
            {activeDbConfig?.name || (config.source === "env" ? ".env 当前配置" : "后台保存配置")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.source === "env" ? (
            <Button variant="secondary" onClick={onSaveEnv}>使用当前 .env 创建档案</Button>
          ) : null}
          <TestButton id="current" state={testState} onClick={onTest} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <MiniInfo label="Provider" value={providerLabel(config.provider)} />
        <MiniInfo label={modelSummaryLabel(config.provider)} value={displayModel(config)} />
        <MiniInfo label="Key 状态" value={keyStatusText(config)} />
        <MiniInfo label="Fallback" value={config.fallbackProvider} />
      </div>
      <TestResult id="current" state={testState} />
    </Surface>
  );
}

function ConfigList({
  configs,
  activeId,
  testState,
  busy,
  onTest,
  onEdit,
  onActivate,
  onDelete,
  onNew,
  onCreateFromEnv
}: {
  configs: PublicDbConfig[];
  activeId: string | null;
  testState: TestState;
  busy: boolean;
  onTest: (config: PublicDbConfig) => void;
  onEdit: (config: PublicDbConfig) => void;
  onActivate: (config: PublicDbConfig) => void;
  onDelete: (config: PublicDbConfig) => void;
  onNew: () => void;
  onCreateFromEnv: () => void;
}) {
  return (
    <Surface tone="plain" padding="sm" className="space-y-3 border border-[color:var(--skin-border)] bg-white/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={skin.typography.sectionTitle}>配置档案 {configs.length}</p>
          <p className={cn("mt-1", skin.typography.meta)}>
            OpenAI、火山方舟和本地 provider 的模型与密钥分别保存在各自档案中。
          </p>
        </div>
        <Button variant="secondary" onClick={onNew} disabled={busy}>新建配置档案</Button>
      </div>

      {configs.length ? (
        <div className="grid gap-2">
          {configs.map((config) => {
            const isCurrent = config.id === activeId || config.isActive;
            return (
              <Surface
                key={config.id}
                tone={isCurrent ? "raised" : "muted"}
                padding="sm"
                className={cn(
                  "space-y-2",
                  isCurrent && "border-emerald-200 bg-emerald-50/70"
                )}
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className={cn("truncate font-semibold", skin.typography.value)} title={config.name}>{config.name}</p>
                    <p className={cn("mt-1 truncate", skin.typography.meta)}>{providerLabel(config.provider)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className={skin.typography.label}>{modelSummaryLabel(config.provider)}</p>
                    <p className={cn("mt-1 line-clamp-2 break-words font-medium", skin.typography.value)} title={displayModel(config)}>
                      {displayModel(config)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={keyConfigured(config) === false ? "warning" : "neutral"}>{keyStatusText(config)}</StatusPill>
                      <StatusPill tone="neutral">{config.status}</StatusPill>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {isCurrent ? <StatusPill tone="success">当前使用</StatusPill> : null}
                    {isCurrent ? null : (
                      <Button variant="secondary" size="sm" onClick={() => onActivate(config)} disabled={busy}>设为当前</Button>
                    )}
                    <TestButton id={config.id} state={testState} onClick={() => onTest(config)} />
                    <Button variant="secondary" size="sm" onClick={() => onEdit(config)} disabled={busy}>编辑</Button>
                    <Button variant="secondary" size="sm" onClick={() => onDelete(config)} disabled={isCurrent || busy}>删除</Button>
                  </div>
                </div>
                <TestResult id={config.id} state={testState} />
              </Surface>
            );
          })}
        </div>
      ) : (
        <Surface tone="muted" padding="sm" className={cn("space-y-3 text-muted-foreground", skin.typography.bodyDense)}>
          <p>
            还没有后台配置档案。当前系统继续使用 .env。你可以从 .env 创建一个配置档案，或新建 OpenAI / 火山方舟 / 本地模型配置。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onCreateFromEnv} disabled={busy}>使用当前 .env 创建档案</Button>
            <Button variant="secondary" onClick={onNew} disabled={busy}>新建空白配置</Button>
          </div>
        </Surface>
      )}
    </Surface>
  );
}

function PanelMessageView({ message }: { message: NonNullable<PanelMessage> }) {
  const className = message.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : message.tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-sky-200 bg-sky-50 text-sky-800";
  const pillTone = message.tone === "success" ? "success" : message.tone === "error" ? "danger" : "info";
  const label = message.tone === "success" ? "成功" : message.tone === "error" ? "失败" : "提示";

  return (
    <Surface tone="muted" padding="sm" className={cn(className, skin.typography.bodyDense)}>
      <div className="flex flex-wrap items-start gap-2">
        <StatusPill tone={pillTone}>{label}</StatusPill>
        <p className="min-w-0 flex-1 break-words">{message.message}</p>
      </div>
    </Surface>
  );
}

function AdvancedFields({
  form,
  activeKey,
  setForm
}: {
  form: FormState;
  activeKey: ReturnType<typeof currentKeyMeta>;
  setForm: Dispatch<SetStateAction<FormState>>;
}) {
  if (form.provider === "mock") {
    return (
      <Surface tone="muted" padding="sm">
        <p className={skin.typography.sectionTitle}>Mock 不调用外部 AI</p>
        <p className={cn("mt-1", skin.typography.meta)}>Mock 使用本地兜底规则，不需要 Base URL、API Key、模型或代理配置。</p>
      </Surface>
    );
  }

  if (form.provider === "local") {
    return (
      <Surface tone="muted" padding="sm" className="space-y-3">
        <p className={skin.typography.sectionTitle}>旧本地占位，暂不启用真实识别。</p>
        <Field label="Fallback provider">
          <ProviderSelect value={form.fallbackProvider} onChange={(value) => setForm((current) => ({ ...current, fallbackProvider: value }))} />
        </Field>
      </Surface>
    );
  }

  return (
    <Surface tone="muted" padding="sm" className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {form.provider === "openai" ? (
          <>
            <Field label="Base URL">
              <Input value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="如使用中转站，填写兼容 OpenAI 的 Base URL" />
            </Field>
            <Field label="OpenAI Proxy URL">
              <Input value={form.openaiProxyUrl} onChange={(event) => setForm((current) => ({ ...current, openaiProxyUrl: event.target.value }))} placeholder="可选，例如 http://127.0.0.1:7890" />
            </Field>
            <CommonVisionFields form={form} setForm={setForm} />
          </>
        ) : null}

        {form.provider === "volcengine" ? (
          <>
            <Field label="Volcengine Base URL">
              <Input value={form.volcengineBaseUrl} onChange={(event) => setForm((current) => ({ ...current, volcengineBaseUrl: event.target.value }))} placeholder="https://ark.cn-beijing.volces.com/api/v3" />
            </Field>
            <Field label="Volcengine Proxy URL">
              <Input value={form.volcengineProxyUrl} onChange={(event) => setForm((current) => ({ ...current, volcengineProxyUrl: event.target.value }))} placeholder="可选，例如 http://127.0.0.1:7890" />
            </Field>
            <CommonVisionFields form={form} setForm={setForm} />
          </>
        ) : null}

        {form.provider === "local_ollama" ? (
          <>
            <LocalFields form={form} setForm={setForm} />
            <Field label="Fallback provider">
              <ProviderSelect value={form.fallbackProvider} onChange={(value) => setForm((current) => ({ ...current, fallbackProvider: value }))} />
            </Field>
            <TimeoutField form={form} setForm={setForm} />
          </>
        ) : null}

        {form.provider === "local_openai_compatible" ? (
          <>
            <LocalFields form={form} setForm={setForm} mode="openai-compatible" />
            <CommonVisionFields form={form} setForm={setForm} />
          </>
        ) : null}
      </div>
      {activeKey ? (
        <label className={cn("flex items-center gap-2", skin.typography.meta)}>
          <input
            type="checkbox"
            checked={form[activeKey.clearField]}
            onChange={(event) => setForm((current) => ({ ...current, [activeKey.clearField]: event.target.checked }))}
          />
          清空当前 provider 的已保存密钥
        </label>
      ) : null}
    </Surface>
  );
}

function CommonVisionFields({ form, setForm }: { form: FormState; setForm: Dispatch<SetStateAction<FormState>> }) {
  return (
    <>
      <Field label="Fallback provider">
        <ProviderSelect value={form.fallbackProvider} onChange={(value) => setForm((current) => ({ ...current, fallbackProvider: value }))} />
      </Field>
      <Field label="Frame max">
        <Input type="number" min={1} max={8} value={form.frameMax} onChange={(event) => setForm((current) => ({ ...current, frameMax: Number(event.target.value) }))} />
      </Field>
      <Field label="Image detail">
        <Select value={form.imageDetail} onChange={(event) => setForm((current) => ({ ...current, imageDetail: event.target.value as ImageDetail }))}>
          {AI_IMAGE_DETAILS.map((detail) => (
            <option key={detail} value={detail}>{detail}</option>
          ))}
        </Select>
      </Field>
      <TimeoutField form={form} setForm={setForm} />
    </>
  );
}

function TimeoutField({ form, setForm }: { form: FormState; setForm: Dispatch<SetStateAction<FormState>> }) {
  return (
    <Field label="Timeout ms">
      <Input type="number" min={5000} max={180000} step={1000} value={form.requestTimeoutMs} onChange={(event) => setForm((current) => ({ ...current, requestTimeoutMs: Number(event.target.value) }))} />
    </Field>
  );
}

function LocalFields({ form, setForm, mode = "local" }: { form: FormState; setForm: Dispatch<SetStateAction<FormState>>; mode?: "local" | "openai-compatible" }) {
  const isOpenAiCompatible = mode === "openai-compatible";
  return (
    <>
      <Field label={isOpenAiCompatible ? "中转站 Base URL" : "Local Base URL"}>
        <Input
          value={form.localBaseUrl}
          onChange={(event) => setForm((current) => ({ ...current, localBaseUrl: event.target.value }))}
          placeholder={isOpenAiCompatible ? "https://your-relay.example.com/v1" : "http://127.0.0.1:11434"}
        />
      </Field>
      {isOpenAiCompatible ? null : (
        <Field label="Local Healthcheck URL">
          <Input value={form.localHealthcheckUrl} onChange={(event) => setForm((current) => ({ ...current, localHealthcheckUrl: event.target.value }))} placeholder="可选，自定义 healthcheck URL" />
        </Field>
      )}
    </>
  );
}

function ProviderSelect({ value, onChange }: { value: AiProvider; onChange: (value: AiProvider) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as AiProvider)}>
      {AI_PROVIDERS.map((provider) => (
        <option key={provider} value={provider}>{providerLabel(provider)}</option>
      ))}
    </Select>
  );
}

function TestButton({ id, state, onClick }: { id: string; state: TestState; onClick: () => void }) {
  const testing = state.status === "testing" && state.id === id;
  return (
    <Button variant="secondary" size="sm" onClick={onClick} disabled={state.status === "testing"}>
      {testing ? "测试中..." : "测试"}
    </Button>
  );
}

function TestResult({ id, state }: { id: string; state: TestState }) {
  if (state.status === "idle" || state.status === "testing" || state.id !== id) return null;
  const provider = typeof state.diagnostics?.provider === "string" ? state.diagnostics.provider : "";
  const isLocalHealthcheck = provider === "local_ollama";
  return (
    <Surface
      tone="muted"
      padding="sm"
      className={
        state.status === "success"
          ? cn("border-emerald-200 bg-emerald-50 text-emerald-800", skin.typography.bodyDense)
          : cn("border-red-200 bg-red-50 text-red-800", skin.typography.bodyDense)
      }
    >
      <StatusPill tone={state.status === "success" ? "success" : "danger"}>{state.status === "success" ? "测试成功" : "测试失败"}</StatusPill>
      <p className="mt-1 break-all">{state.message}</p>
      <p className={cn("mt-1", skin.typography.meta)}>
        {isLocalHealthcheck
          ? "本地 healthcheck 不发送图片，不调用识别接口，也不会改变入库 AI 行为。"
          : "测试会发送一张 64x64 测试图片，用于验证图片输入和结构化输出能力。"}
      </p>
      {state.diagnostics ? (
        <pre className={cn("mt-2 max-h-44 overflow-auto rounded-md bg-white/70 p-2 text-slate-700", skin.textDensity.metadata)}>
          {JSON.stringify(state.diagnostics, null, 2)}
        </pre>
      ) : null}
    </Surface>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[var(--skin-radius-control)] border border-[color:var(--skin-border-muted)] bg-white/50 px-3 py-2">
      <p className={skin.typography.label}>{label}</p>
      <p className={cn("mt-1 break-all font-medium", skin.typography.value)}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className={skin.typography.label}>{label}</span>
      {children}
    </label>
  );
}

function SecretInput({
  label,
  optional,
  configured,
  value,
  clear,
  onValue,
  onClear
}: {
  label: string;
  optional: boolean;
  configured: boolean;
  value: string;
  clear: boolean;
  onValue: (value: string) => void;
  onClear: (value: boolean) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={skin.typography.label}>{label}</span>
        <StatusPill tone={configured ? "success" : optional ? "neutral" : "warning"}>
          {configured ? "已配置" : optional ? "可选" : "未配置"}
        </StatusPill>
      </div>
      <Input
        type="password"
        value={value}
        onChange={(event) => onValue(event.target.value)}
        placeholder={configured ? "已配置，留空不覆盖" : optional ? "可选，留空即可" : "输入 API Key"}
        disabled={clear}
      />
      {clear ? (
        <button type="button" className={cn("w-fit text-red-700", skin.typography.meta)} onClick={() => onClear(false)}>
          已勾选清空，点击取消
        </button>
      ) : null}
    </div>
  );
}

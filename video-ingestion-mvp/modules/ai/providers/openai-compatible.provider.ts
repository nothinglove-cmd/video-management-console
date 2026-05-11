import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

import type { AiClassification, ClassifierContext, ClassifierResult } from "@/modules/ai/material-classifier.service";
import type { OpenAiCompatibleProviderConfig } from "@/modules/ai/providers/types";

class OpenAiProviderError extends Error {
  status?: number;
  requestId?: string | null;
  errorType?: string;

  constructor(message: string, options?: { status?: number; requestId?: string | null; errorType?: string }) {
    super(message);
    this.name = "OpenAiProviderError";
    this.status = options?.status;
    this.requestId = options?.requestId;
    this.errorType = options?.errorType;
  }
}

function classifyOpenAiError(status?: number | null, message = "") {
  const text = message.toLowerCase();
  if (status === 401) return "authentication_failed";
  if (status === 429) return "rate_limited_or_quota_exceeded";
  if (status === 400 && (text.includes("image") || text.includes("vision"))) return "model_or_image_input_not_supported";
  if (text.includes("timeout") || text.includes("aborted")) return "request_timeout";
  if (text.includes("json") || text.includes("schema")) return "schema_or_json_parse_failed";
  if (status && status >= 500) return "openai_server_error";
  if (status) return "openai_http_error";
  return "network_or_runtime_error";
}

export function summarizeOpenAiError(error: unknown) {
  if (error instanceof OpenAiProviderError) {
    return {
      message: error.message,
      status: error.status ?? null,
      requestId: error.requestId ?? null,
      errorType: error.errorType || classifyOpenAiError(error.status, error.message)
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    status: null,
    requestId: null,
    errorType: classifyOpenAiError(null, message)
  };
}

function providerLabel(provider: "openai" | "volcengine") {
  return provider === "volcengine" ? "火山方舟" : "OpenAI";
}

export class OpenAiCompatibleProvider {
  async classify(frames: string[], context: ClassifierContext, config: OpenAiCompatibleProviderConfig): Promise<ClassifierResult> {
    const label = providerLabel(config.provider);
    const sentFrames = frames.slice(0, config.frameMax);
    const imageInputs = await Promise.all(
      sentFrames.map(async (frame) => ({
        type: "input_image",
        detail: config.imageDetail,
        image_url: await this.toDataUrl(frame)
      }))
    );

    const requestBody = {
      model: config.model,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: config.buildPrompt(context)
            },
            ...imageInputs
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "video_material_classification",
          strict: true,
          schema: config.outputJsonSchema(config.provider === "volcengine")
        }
      }
    };

    const response = await this.postOpenAiJson({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      body: requestBody,
      timeoutMs: config.requestTimeoutMs,
      proxyUrl: config.proxyUrl
    });

    const requestId = response.headers["x-request-id"] || null;
    if (response.status < 200 || response.status >= 300) {
      const errorMessage = this.extractOpenAiErrorMessage(response.body);
      throw new OpenAiProviderError(`${label} API ${response.status}: ${errorMessage}`, {
        status: response.status,
        requestId,
        errorType: classifyOpenAiError(response.status, errorMessage)
      });
    }

    const raw = JSON.parse(response.body) as Record<string, unknown>;
    const outputText = this.extractOutputText(raw);
    if (!outputText) {
      throw new OpenAiProviderError(`${label} API 未返回可解析的 JSON 文本。`, {
        status: response.status,
        requestId,
        errorType: "schema_or_json_parse_failed"
      });
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(outputText) as unknown;
    } catch (error) {
      throw new OpenAiProviderError(`${label} JSON 解析失败：${(error as Error).message}`, {
        status: response.status,
        requestId,
        errorType: "schema_or_json_parse_failed"
      });
    }

    const validated = config.validateClassification(parsedJson, `${label} 输出异常`);
    const localized = config.localizeClassificationText(validated.classification as AiClassification);
    const languageWarnings = [
      localized.changed ? `${label} 返回了英文自然语言字段，系统已尝试转为中文。` : "",
      localized.stillEnglish ? `${label} 输出中仍存在英文字段，请在详情页人工确认后再应用建议。` : ""
    ].filter(Boolean);
    return {
      classification: {
        ...localized.classification,
        needsHumanReview: localized.stillEnglish ? true : localized.classification.needsHumanReview
      },
      provider: config.provider,
      requestedProvider: config.provider,
      usedFallback: false,
      diagnostics: {
        requestedProvider: config.provider,
        actualProvider: config.provider,
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        frameCount: frames.length,
        sentFrameCount: sentFrames.length,
        imageDetail: config.imageDetail,
        timeoutMs: config.requestTimeoutMs,
        proxyEnabled: Boolean(config.proxyUrl),
        requestId,
        status: response.status,
        fallbackUsed: false,
        note: languageWarnings.join("；") || undefined
      },
      warnings: [...validated.warnings, ...languageWarnings],
      raw
    };
  }

  async postOpenAiJson({
    baseUrl,
    apiKey,
    body,
    timeoutMs,
    proxyUrl
  }: {
    baseUrl: string;
    apiKey: string;
    body: unknown;
    timeoutMs: number;
    proxyUrl?: string;
  }) {
    const payload = JSON.stringify(body);
    if (proxyUrl) {
      return this.postJsonThroughHttpProxy({
        targetUrl: `${baseUrl.replace(/\/$/, "")}/responses`,
        apiKey,
        payload,
        timeoutMs,
        proxyUrl
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`AI provider 请求超过 ${timeoutMs}ms 未响应`)), timeoutMs);
    const endpoint = `${baseUrl.replace(/\/$/, "")}/responses`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: payload,
        signal: controller.signal
      });
      const responseBody = await response.text();
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody
      };
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new OpenAiProviderError(`AI provider 请求 ${endpoint} 超过 ${timeoutMs}ms 未响应`, {
          errorType: "request_timeout"
        });
      }
      throw new OpenAiProviderError(`AI provider 请求 ${endpoint} 失败：${error instanceof Error ? error.message : String(error)}`, {
        errorType: "network_or_runtime_error"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  postJsonThroughHttpProxy({
    targetUrl,
    apiKey,
    payload,
    timeoutMs,
    proxyUrl
  }: {
    targetUrl: string;
    apiKey: string;
    payload: string;
    timeoutMs: number;
    proxyUrl: string;
  }): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const target = new URL(targetUrl);
    const proxy = new URL(proxyUrl);

    if (proxy.protocol !== "http:") {
      throw new OpenAiProviderError("代理地址目前只支持 http://，例如 http://127.0.0.1:7890。", {
        errorType: "proxy_protocol_not_supported"
      });
    }

    return new Promise((resolve, reject) => {
      const socket = net.connect(Number(proxy.port || 80), proxy.hostname);
      const timer = setTimeout(() => {
        socket.destroy();
        reject(
          new OpenAiProviderError(`AI provider 代理请求超过 ${timeoutMs}ms 未响应`, {
            errorType: "request_timeout"
          })
        );
      }, timeoutMs);
      let connectBuffer = "";
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        reject(error);
      };

      socket.on("connect", () => {
        socket.write(
          [
            `CONNECT ${target.hostname}:443 HTTP/1.1`,
            `Host: ${target.hostname}:443`,
            "Proxy-Connection: Keep-Alive",
            "",
            ""
          ].join("\r\n")
        );
      });

      socket.on("data", (chunk) => {
        connectBuffer += chunk.toString("utf8");
        if (!connectBuffer.includes("\r\n\r\n")) return;
        if (!/^HTTP\/1\.[01] 200/.test(connectBuffer)) {
          fail(new OpenAiProviderError(`代理连接 AI provider 失败：${connectBuffer.split("\r\n")[0] || "未知错误"}`));
          return;
        }

        socket.removeAllListeners("data");
        const secureSocket = tls.connect({ socket, servername: target.hostname }, () => {
          const request = [
            `POST ${target.pathname} HTTP/1.1`,
            `Host: ${target.hostname}`,
            `Authorization: Bearer ${apiKey}`,
            "Content-Type: application/json",
            `Content-Length: ${Buffer.byteLength(payload)}`,
            "Connection: close",
            "",
            payload
          ].join("\r\n");
          secureSocket.write(request);
        });
        const chunks: Buffer[] = [];
        secureSocket.on("data", (data) => chunks.push(Buffer.from(data)));
        secureSocket.on("error", fail);
        secureSocket.on("end", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(this.parseHttpResponse(Buffer.concat(chunks)));
        });
      });

      socket.on("error", fail);
    });
  }

  parseHttpResponse(raw: Buffer) {
    const separator = raw.indexOf("\r\n\r\n");
    const headBuffer = separator >= 0 ? raw.subarray(0, separator) : raw;
    const bodyBuffer = separator >= 0 ? raw.subarray(separator + 4) : Buffer.alloc(0);
    const head = headBuffer.toString("latin1");
    const headerLines = head.split("\r\n");
    const status = Number(headerLines[0]?.split(" ")[1] || 0);
    const headers: Record<string, string> = {};
    for (const line of headerLines.slice(1)) {
      const index = line.indexOf(":");
      if (index === -1) continue;
      headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
    }
    return {
      status,
      headers,
      body: headers["transfer-encoding"] === "chunked"
        ? this.decodeChunkedBody(bodyBuffer).toString("utf8")
        : bodyBuffer.toString("utf8")
    };
  }

  decodeChunkedBody(body: Buffer) {
    let index = 0;
    const chunks: Buffer[] = [];
    while (index < body.byteLength) {
      const nextLine = body.indexOf("\r\n", index);
      if (nextLine === -1) return chunks.length ? Buffer.concat(chunks) : body;
      const sizeText = body.subarray(index, nextLine).toString("latin1").split(";")[0];
      const size = Number.parseInt(sizeText, 16);
      if (!Number.isFinite(size)) return chunks.length ? Buffer.concat(chunks) : body;
      if (size === 0) return Buffer.concat(chunks);
      const chunkStart = nextLine + 2;
      chunks.push(body.subarray(chunkStart, chunkStart + size));
      index = chunkStart + size + 2;
    }
    return Buffer.concat(chunks);
  }

  extractOpenAiErrorMessage(body: string) {
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
      return parsed.error?.message || body.slice(0, 500);
    } catch {
      return body.slice(0, 500);
    }
  }

  async toDataUrl(filePath: string) {
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = extension === ".png" ? "image/png" : "image/jpeg";
    const data = await fs.readFile(filePath);
    return `data:${mimeType};base64,${data.toString("base64")}`;
  }

  extractOutputText(response: Record<string, unknown>) {
    if (typeof response.output_text === "string") return response.output_text;
    const output = response.output;
    if (!Array.isArray(output)) return null;

    for (const item of output) {
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const contentItem of content) {
        const text = (contentItem as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }

    return null;
  }
}

export const openAiCompatibleProvider = new OpenAiCompatibleProvider();

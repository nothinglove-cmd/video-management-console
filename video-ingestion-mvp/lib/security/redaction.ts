const SENSITIVE_KEY_PATTERN = /(authorization|api[_-]?key|access[_-]?token|token|secret|password|credential)/i;
const SENSITIVE_ENV_PATTERN = /\b(OPENAI_API_KEY|ARK_API_KEY|LOCAL_AI_API_KEY|AI_API_KEY)\b/g;
const AUTHORIZATION_PATTERN = /\bAuthorization\s*:\s*Bearer\s+[^\s,;}]+/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const OPENAI_KEY_PATTERN = /\bsk-(?:proj-)?[A-Za-z0-9_-]{8,}/g;
const QUERY_SECRET_PATTERN = /([?&](?:api[_-]?key|key|token|access[_-]?token|authorization|secret|password)=)[^&#\s]+/gi;

export function sanitizeUrlForDiagnostics(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return redactSensitiveText(trimmed)
      .replace(/\/\/[^/@\s]+@/g, "//")
      .replace(QUERY_SECRET_PATTERN, "$1[REDACTED]")
      .split("#")[0];
  }
}

export function redactSensitiveText(value: string) {
  return value
    .replace(AUTHORIZATION_PATTERN, "Authorization: Bearer [REDACTED]")
    .replace(BEARER_PATTERN, "Bearer [REDACTED]")
    .replace(OPENAI_KEY_PATTERN, "[REDACTED_KEY]")
    .replace(SENSITIVE_ENV_PATTERN, "[REDACTED_ENV]")
    .replace(QUERY_SECRET_PATTERN, "$1[REDACTED]");
}

export function sanitizeDiagnostics<T>(value: T): T {
  return sanitizeValue(value, "") as T;
}

function sanitizeValue(value: unknown, key: string): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (isUrlLikeKey(key)) return sanitizeUrlForDiagnostics(value);
    return redactSensitiveText(value);
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));

  const result: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (isSensitiveKey(entryKey)) {
      result[entryKey] = typeof entryValue === "boolean" ? entryValue : "[REDACTED]";
      continue;
    }
    result[entryKey] = sanitizeValue(entryValue, entryKey);
  }
  return result;
}

function isSensitiveKey(key: string) {
  if (/configured$/i.test(key)) return false;
  return SENSITIVE_KEY_PATTERN.test(key);
}

function isUrlLikeKey(key: string) {
  return /(url|endpoint)$/i.test(key);
}

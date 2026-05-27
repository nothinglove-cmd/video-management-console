export const DEFAULT_OPERATOR = {
  id: "system",
  name: "系统",
  role: "LOCAL_OPERATOR"
} as const;

export function normalizeOperatorName(value?: string | null) {
  return value?.trim() || DEFAULT_OPERATOR.name;
}

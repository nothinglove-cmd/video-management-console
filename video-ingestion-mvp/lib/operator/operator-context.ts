export const DEFAULT_OPERATOR = {
  id: "local-admin",
  name: "本地管理员",
  role: "LOCAL_OPERATOR"
} as const;

export function normalizeOperatorName(value?: string | null) {
  return value?.trim() || DEFAULT_OPERATOR.name;
}

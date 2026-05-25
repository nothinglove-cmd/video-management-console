type ByteSizeValue = number | bigint;
type NullableByteSizeValue = ByteSizeValue | null | undefined;

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

export function byteSizeToBigInt(value: ByteSizeValue) {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`Invalid byte size: ${value.toString()}`);
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid byte size: ${value}`);
  }
  return BigInt(value);
}

export function nullableByteSizeToBigInt(value: NullableByteSizeValue) {
  if (value === null || value === undefined) return null;
  return byteSizeToBigInt(value);
}

export function byteSizeToSafeNumber(value: ByteSizeValue) {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`Invalid byte size: ${value}`);
    }
    return value;
  }
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new Error(`Byte size exceeds JavaScript safe integer range: ${value.toString()}`);
  }
  return Number(value);
}

export function nullableByteSizeToSafeNumber(value: NullableByteSizeValue) {
  if (value === null || value === undefined) return null;
  return byteSizeToSafeNumber(value);
}

export function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value >= MIN_SAFE_BIGINT && value <= MAX_SAFE_BIGINT
      ? Number(value)
      : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] = toJsonSafe(item);
  }
  return output;
}

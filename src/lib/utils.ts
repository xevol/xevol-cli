export function pickValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

/** Like pickValue but returns "—" instead of undefined (for table display). */
export function pickValueOrDash(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return "—";
}

export function pickSessionField(data: Record<string, unknown>, key: string): string | undefined {
  const direct = data[key];
  if (typeof direct === "string") return direct;
  const nested = (data.session as Record<string, unknown> | undefined)?.[key];
  if (typeof nested === "string") return nested;
  return undefined;
}

export function pickNumberField(data: Record<string, unknown>, key: string): number | undefined {
  const direct = data[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string") {
    const parsed = Number(direct);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function extractId(data: Record<string, unknown>): string | undefined {
  return (
    pickValue(data, ["id", "transcriptionId"]) ??
    (data.transcription as Record<string, unknown> | undefined)?.id?.toString() ??
    (data.data as Record<string, unknown> | undefined)?.id?.toString()
  );
}

export function extractStatus(data: Record<string, unknown>): string | undefined {
  return pickValue(data, ["status", "state"]);
}

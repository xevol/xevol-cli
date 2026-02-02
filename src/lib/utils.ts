/** Pick the first non-empty string value matching any of the given keys from a flat record. */
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

/**
 * Extract a field from an API session response, checking multiple nesting levels.
 *
 * The /auth/session endpoint returns { user: {...}, session: {...} }, but the
 * device-token endpoint returns flat { token, accountId, email, expiresAt }.
 * Other endpoints may nest differently too.
 *
 * This function handles all shapes by checking three locations:
 *   1. data[key]         — flat response (e.g., device-token: { token: "..." })
 *   2. data.user[key]    — nested under user (e.g., session: { user: { email: "..." } })
 *   3. data.session[key] — nested under session (e.g., session: { session: { id: "..." } })
 *
 * This lets the CLI work with any response shape without needing to know
 * which endpoint returned the data — a form of duck typing for API responses.
 */
export function pickSessionField(data: Record<string, unknown>, key: string): string | undefined {
  // Try direct access first (flat responses like device-token)
  const direct = data[key];
  if (typeof direct === "string") return direct;

  // Try under data.user (standard session response: { user: { email, id, ... } })
  const fromUser = (data.user as Record<string, unknown> | undefined)?.[key];
  if (typeof fromUser === "string") return fromUser;

  // Try under data.session (for fields on the session object itself, like session.id)
  const fromSession = (data.session as Record<string, unknown> | undefined)?.[key];
  if (typeof fromSession === "string") return fromSession;

  return undefined;
}

/**
 * Extract a numeric field from an API response. Handles both number and
 * string-encoded numbers (some APIs return numbers as strings in JSON).
 */
export function pickNumberField(data: Record<string, unknown>, key: string): number | undefined {
  const direct = data[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  // Handle string-encoded numbers (e.g., "300" instead of 300)
  if (typeof direct === "string") {
    const parsed = Number(direct);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Extract an entity ID from a response, trying common field names and nested structures. */
export function extractId(data: Record<string, unknown>): string | undefined {
  return (
    pickValue(data, ["id", "transcriptionId"]) ??
    (data.transcription as Record<string, unknown> | undefined)?.id?.toString() ??
    (data.data as Record<string, unknown> | undefined)?.id?.toString()
  );
}

/** Extract a status/state string from a response, trying common field names. */
export function extractStatus(data: Record<string, unknown>): string | undefined {
  return pickValue(data, ["status", "state"]);
}

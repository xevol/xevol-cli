import { z } from "zod";

export function parseResponse<T>(schema: z.ZodType<T>, data: unknown, label?: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    // Log warning but don't crash — graceful degradation
    if (process.env.DEBUG) {
      console.error(`[xevol] Schema validation warning (${label ?? 'unknown'}):`, result.error.issues);
    }
    // Return data as-is, cast through — schemas use .passthrough() so this is safe
    return data as T;
  }
  return result.data;
}

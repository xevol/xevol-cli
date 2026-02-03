import { readConfig, resolveApiUrl } from "./config";

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  /** CLI token to send as Authorization: Bearer header */
  token?: string;
  /** Override the base API URL (defaults to config or XEVOL_API_URL) */
  apiUrl?: string;
  /** Optional AbortSignal for cancellation (combined with 30s timeout) */
  signal?: AbortSignal;
}

/**
 * Build the full request URL from a path, optional query params, and base URL.
 * Null/undefined query values are silently skipped.
 */
function buildRequestUrl(path: string, query?: Record<string, QueryValue>, apiUrl?: string): URL {
  const baseUrl = apiUrl ?? resolveApiUrl();
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

/**
 * Attach the CLI token as a Bearer token in the Authorization header.
 *
 * This is how the CLI authenticates with the API — every request includes
 * "Authorization: Bearer xevol_cli_..." which the API middleware (tryAttachUser
 * or requireCliToken) validates against the cliTokens database table.
 *
 * The token is trimmed to handle accidental whitespace from config files or
 * environment variables.
 */
function applyAuthHeaders(headers: HeadersInit, token?: string): HeadersInit {
  const normalizedToken = token?.trim();
  if (!normalizedToken) return headers;
  const next = new Headers(headers);
  // Standard OAuth 2.0 Bearer token format — the API's getBearerToken()
  // helper splits on space and checks for "bearer" scheme
  next.set("Authorization", `Bearer ${normalizedToken}`);
  return next;
}

/** Try to extract a human-readable error from an API error response body. */
async function parseErrorBody(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { message?: string; error?: string };
      return data.message ?? data.error ?? JSON.stringify(data);
    }
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Core API fetch wrapper used by all CLI commands.
 *
 * Handles:
 *   - Base URL resolution (from config, env, or explicit apiUrl)
 *   - Bearer token authentication (from stored CLI token)
 *   - Query parameter serialization
 *   - JSON body serialization (auto-sets Content-Type for non-FormData bodies)
 *   - Error response parsing (extracts message from JSON or text error bodies)
 *   - Method inference (GET if no body, POST if body provided)
 *
 * Throws on non-2xx responses with a descriptive error message.
 */
export async function apiFetch<T = unknown>(
  path: string,
  { method, query, body, headers, token, apiUrl, signal }: ApiRequestOptions = {},
): Promise<T> {
  const config = await readConfig();
  const url = buildRequestUrl(path, query, apiUrl);

  // Apply Bearer token auth — this is the primary way CLI authenticates.
  // The token comes from the local config file (written by `xevol login`).
  let requestHeaders = new Headers(applyAuthHeaders(headers ?? {}, token));

  if (config?.workspaceId && !requestHeaders.has("X-Workspace-Id")) {
    requestHeaders.set("X-Workspace-Id", config.workspaceId);
  }

  // Auto-set Content-Type for JSON bodies. FormData handles its own
  // Content-Type (with boundary) so we don't touch it.
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
  }

  // Combine user-provided signal with a 30s timeout signal
  const timeoutSignal = AbortSignal.timeout(30000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, {
      // Smart method default: GET for reads (no body), POST for writes (has body)
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: requestHeaders,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal: combinedSignal,
    });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new Error(`Request timed out after 30s. Is the API at ${url.origin} reachable?`);
    }
    throw new Error(`Network error: could not reach ${url.origin}. Check your connection or API status.`);
  }

  if (!response.ok) {
    // Parse the error body to give the user a useful error message
    // instead of just "API 401"
    const details = await parseErrorBody(response);
    const message = details ? `API ${response.status}: ${details}` : `API ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  // Parse response based on Content-Type — JSON if available, text otherwise
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

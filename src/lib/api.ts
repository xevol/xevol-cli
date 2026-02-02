import { resolveApiUrl } from "./config";

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  token?: string;
  apiUrl?: string;
}

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

function applyAuthHeaders(headers: HeadersInit, token?: string): HeadersInit {
  const normalizedToken = token?.trim();
  if (!normalizedToken) return headers;
  const next = new Headers(headers);
  next.set("Authorization", `Bearer ${normalizedToken}`);
  return next;
}

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

export async function apiFetch<T = unknown>(
  path: string,
  { method, query, body, headers, token, apiUrl }: ApiRequestOptions = {},
): Promise<T> {
  const url = buildRequestUrl(path, query, apiUrl);
  const requestHeaders = applyAuthHeaders(headers ?? {}, token);

  if (body !== undefined && !(body instanceof FormData)) {
    (requestHeaders as Headers).set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: requestHeaders,
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await parseErrorBody(response);
    const message = details ? `API ${response.status}: ${details}` : `API ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

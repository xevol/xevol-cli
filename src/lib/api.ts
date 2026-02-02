import { readConfig, resolveApiUrl, resolveToken } from "./config";

type QueryValue = string | number | boolean | null | undefined;

export interface ApiRequestOptions {
  method?: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  token?: string;
  apiUrl?: string;
}

async function buildRequestUrl(path: string, query?: Record<string, QueryValue>, apiUrl?: string): Promise<URL> {
  const config = (await readConfig()) ?? {};
  const baseUrl = apiUrl ?? resolveApiUrl(config);
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
  if (!token) return headers;
  const next = new Headers(headers);
  next.set("Authorization", `Bearer ${token}`);
  next.set("Cookie", `xevol_session=${token}`);
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
  const config = (await readConfig()) ?? {};
  const authToken = resolveToken(config, token);
  const url = await buildRequestUrl(path, query, apiUrl);
  const requestHeaders = applyAuthHeaders(headers ?? {}, authToken);

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

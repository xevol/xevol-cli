import { useCallback, useEffect, useRef, useState } from "react";
import type { DependencyList } from "react";
import { apiFetch, type ApiRequestOptions } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { cacheKey, getCached, inferTTL, setCache } from "../../lib/cache";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useApi<T>(
  path: string,
  options: ApiRequestOptions = {},
  deps: DependencyList = [],
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const optionsRef = useRef<ApiRequestOptions>(options);
  const mountedRef = useRef(true);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchData = useCallback(async () => {
    const key = cacheKey(path, optionsRef.current.query as Record<string, unknown> | undefined);
    const ttl = inferTTL(path);

    // Check cache first — return cached data immediately (stale-while-revalidate)
    const cached = await getCached<T>(key);
    if (cached) {
      if (mountedRef.current) {
        setData(cached.data);
        // If not stale, don't show loading spinner
        if (!cached.stale) {
          setLoading(false);
        }
      }
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        const message = expired
          ? "Token expired. Run `xevol login` to re-authenticate."
          : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.";
        if (mountedRef.current) {
          setError(message);
          setLoading(false);
        }
        return;
      }

      const apiUrl = resolveApiUrl(config);
      const response = await apiFetch<T>(path, {
        ...optionsRef.current,
        token,
        apiUrl,
      });
      if (mountedRef.current) {
        setData(response);
      }
      // Update cache with fresh data
      void setCache(key, response, ttl);
    } catch (err) {
      if (mountedRef.current) {
        // Only show error if we have no cached data to fall back on
        if (!cached) {
          setError((err as Error).message);
        }
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, ...deps]);

  return { data, loading, error, refresh: fetchData };
}

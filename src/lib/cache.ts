import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(os.homedir(), ".xevol", "cache");

/** Default TTLs in milliseconds */
export const TTL = {
  LIST: 5 * 60 * 1000,       // 5 minutes for lists
  ANALYSIS: 60 * 60 * 1000,  // 1 hour for analysis/prompts
  STATUS: 5 * 60 * 1000,     // 5 minutes for status/usage
} as const;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

/** Generate a cache key from endpoint + params */
export function cacheKey(endpoint: string, params?: Record<string, unknown>): string {
  const raw = params ? `${endpoint}:${JSON.stringify(params)}` : endpoint;
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/** Infer TTL from endpoint path */
export function inferTTL(endpoint: string): number {
  if (endpoint.includes("/transcriptions") || endpoint.includes("/list")) return TTL.LIST;
  if (endpoint.includes("/analysis") || endpoint.includes("/prompts") || endpoint.includes("/spikes")) return TTL.ANALYSIS;
  return TTL.STATUS;
}

function cacheFilePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

/** Get cached data if it exists and hasn't expired */
export async function getCached<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  try {
    const raw = await fs.readFile(cacheFilePath(key), "utf8");
    const entry = JSON.parse(raw) as CacheEntry<T>;
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl * 2) {
      // Way too old, remove it
      void fs.unlink(cacheFilePath(key)).catch(() => {});
      return null;
    }
    return {
      data: entry.data,
      stale: age > entry.ttl,
    };
  } catch {
    return null;
  }
}

/** Store data in cache */
export async function setCache(key: string, data: unknown, ttl?: number): Promise<void> {
  try {
    await ensureCacheDir();
    const entry: CacheEntry<unknown> = {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? TTL.LIST,
    };
    await fs.writeFile(cacheFilePath(key), JSON.stringify(entry), "utf8");
  } catch {
    // Silently fail — cache is best-effort
  }
}

/** Clear all cached data */
export async function clearCache(): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map((f) => fs.unlink(path.join(CACHE_DIR, f)).catch(() => {})),
    );
  } catch {
    // Directory may not exist
  }
}

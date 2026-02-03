import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Command } from "commander";

export interface XevolConfig {
  apiUrl?: string;
  token?: string;
  accountId?: string;
  email?: string;
  expiresAt?: string;
  workspaceId?: string;
  default?: {
    lang?: string;
    limit?: number;
  };
  api?: {
    timeout?: number;
  };
}

export const DEFAULT_API_URL = "https://api.xevol.com";

const CONFIG_DIR = path.join(os.homedir(), ".xevol");
export const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

// ── In-memory config cache ──
let _configCache: XevolConfig | null = null;
let _configCacheAt = 0;
const CONFIG_TTL = 30_000;

async function ensureConfigDir(): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function readConfig(): Promise<XevolConfig | null> {
  if (_configCache && Date.now() - _configCacheAt < CONFIG_TTL) {
    return _configCache;
  }
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const config = JSON.parse(raw) as XevolConfig;
    _configCache = config;
    _configCacheAt = Date.now();
    return config;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }
    // Handle corrupt JSON gracefully
    if (error instanceof SyntaxError) {
      console.error("Warning: config.json is corrupt. Run `xevol login` to fix it.");
      return null;
    }
    throw error;
  }
}

export async function writeConfig(config: XevolConfig): Promise<void> {
  await ensureConfigDir();
  const payload = `${JSON.stringify(config, null, 2)}\n`;
  await fs.writeFile(CONFIG_PATH, payload, { encoding: "utf8", mode: 0o600 });
  _configCache = config;
  _configCacheAt = Date.now();
}

export async function updateConfig(update: Partial<XevolConfig>): Promise<XevolConfig> {
  const existing = (await readConfig()) ?? {};
  const merged = { ...existing, ...update };
  await writeConfig(merged);
  return merged;
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(CONFIG_PATH);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }
}

export function resolveApiUrl(config?: XevolConfig): string {
  return process.env.XEVOL_API_URL ?? config?.apiUrl ?? DEFAULT_API_URL;
}

export function resolveToken(
  config?: XevolConfig,
  tokenOverride?: string,
): { token: string | undefined; expired: boolean } {
  const token = tokenOverride ?? process.env.XEVOL_TOKEN ?? config?.token;
  if (token && !tokenOverride && !process.env.XEVOL_TOKEN && config?.expiresAt) {
    const expiresAt = new Date(config.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && Date.now() >= expiresAt) {
      return { token: undefined, expired: true };
    }
  }
  return { token, expired: false };
}

export function getTokenOverride(options: { token?: string }, command: Command): string | undefined {
  if (options.token) return options.token;
  const globals =
    typeof command.optsWithGlobals === "function" ? command.optsWithGlobals() : (command.parent?.opts() ?? {});
  return globals.token as string | undefined;
}

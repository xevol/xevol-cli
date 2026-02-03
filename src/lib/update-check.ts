import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const CHECK_FILE = path.join(os.homedir(), ".xevol", "update-check.json");
const ONE_DAY = 24 * 60 * 60 * 1000;

interface CheckData {
  lastCheck: number;
  latestVersion?: string;
}

interface UpdateInfo {
  current: string;
  latest: string;
}

async function readCheckData(): Promise<CheckData | null> {
  try {
    const raw = await fs.readFile(CHECK_FILE, "utf8");
    return JSON.parse(raw) as CheckData;
  } catch {
    return null;
  }
}

async function writeCheckData(data: CheckData): Promise<void> {
  try {
    await fs.mkdir(path.dirname(CHECK_FILE), { recursive: true });
    await fs.writeFile(CHECK_FILE, JSON.stringify(data), "utf8");
  } catch {
    // Silently fail
  }
}

function compareVersions(current: string, latest: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

/**
 * Check for updates (once per day max).
 * Returns update info if a newer version is available, null otherwise.
 * Never throws — silently returns null on any error.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const existing = await readCheckData();
    const now = Date.now();

    // Return cached result if checked recently
    if (existing && now - existing.lastCheck < ONE_DAY) {
      if (existing.latestVersion && compareVersions(currentVersion, existing.latestVersion)) {
        return { current: currentVersion, latest: existing.latestVersion };
      }
      return null;
    }

    // Fetch from npm registry
    const response = await fetch("https://registry.npmjs.org/xevol/latest", {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      await writeCheckData({ lastCheck: now });
      return null;
    }

    const data = (await response.json()) as { version?: string };
    const latest = data.version;

    if (!latest) {
      await writeCheckData({ lastCheck: now });
      return null;
    }

    await writeCheckData({ lastCheck: now, latestVersion: latest });

    if (compareVersions(currentVersion, latest)) {
      return { current: currentVersion, latest };
    }

    return null;
  } catch {
    return null;
  }
}

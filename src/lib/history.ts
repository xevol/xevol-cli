import { promises as fs } from "fs";
import os from "os";
import path from "path";

const HISTORY_DIR = path.join(os.homedir(), ".xevol");
const HISTORY_PATH = path.join(HISTORY_DIR, "history.json");
const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  title: string;
  viewedAt: string;
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const entries = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export async function addToHistory(id: string, title: string): Promise<void> {
  const entries = await getHistory();

  // Remove existing entry for this id (if re-viewing)
  const filtered = entries.filter((e) => e.id !== id);

  // Add at front
  filtered.unshift({
    id,
    title,
    viewedAt: new Date().toISOString(),
  });

  // Trim to max
  const trimmed = filtered.slice(0, MAX_ENTRIES);

  await ensureDir();
  await fs.writeFile(HISTORY_PATH, JSON.stringify(trimmed, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
}

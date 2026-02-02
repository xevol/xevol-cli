/**
 * Local job state management for resume functionality.
 * Stores job state in ~/.xevol/jobs/<transcriptionId>.json
 */

import { promises as fs } from "fs";
import os from "os";
import path from "path";

const JOBS_DIR = path.join(os.homedir(), ".xevol", "jobs");

export interface SpikeState {
  spikeId: string;
  promptId: string;
  status: "pending" | "streaming" | "complete" | "error";
  lastEventId?: string;
}

export interface JobState {
  transcriptionId: string;
  url: string;
  spikes: SpikeState[];
  createdAt: string;
  updatedAt: string;
}

async function ensureJobsDir(): Promise<void> {
  await fs.mkdir(JOBS_DIR, { recursive: true });
}

function jobPath(transcriptionId: string): string {
  return path.join(JOBS_DIR, `${transcriptionId}.json`);
}

export async function saveJobState(state: JobState): Promise<void> {
  await ensureJobsDir();
  state.updatedAt = new Date().toISOString();
  const payload = JSON.stringify(state, null, 2) + "\n";
  await fs.writeFile(jobPath(state.transcriptionId), payload, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function loadJobState(transcriptionId: string): Promise<JobState | null> {
  try {
    const raw = await fs.readFile(jobPath(transcriptionId), "utf8");
    return JSON.parse(raw) as JobState;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function updateSpikeState(
  transcriptionId: string,
  spikeId: string,
  update: Partial<SpikeState>,
): Promise<void> {
  const state = await loadJobState(transcriptionId);
  if (!state) return;

  const spike = state.spikes.find((s) => s.spikeId === spikeId);
  if (spike) {
    Object.assign(spike, update);
    await saveJobState(state);
  }
}

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { saveJobState, loadJobState, type JobState } from "../jobs";

// We test against the real jobs dir to avoid mocking
// but use a unique ID to avoid conflicts
const TEST_ID = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const JOBS_DIR = path.join(os.homedir(), ".xevol", "jobs");

afterEach(async () => {
  try {
    await fs.unlink(path.join(JOBS_DIR, `${TEST_ID}.json`));
  } catch {
    // ignore
  }
});

describe("saveJobState / loadJobState", () => {
  test("saves and loads job state", async () => {
    const state: JobState = {
      transcriptionId: TEST_ID,
      url: "https://youtube.com/watch?v=test",
      lang: "kk",
      outputLang: "kk",
      spikes: [
        {
          spikeId: "spike1",
          promptId: "review",
          status: "complete",
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveJobState(state);
    const loaded = await loadJobState(TEST_ID);

    expect(loaded).not.toBeNull();
    expect(loaded!.transcriptionId).toBe(TEST_ID);
    expect(loaded!.url).toBe("https://youtube.com/watch?v=test");
    expect(loaded!.lang).toBe("kk");
    expect(loaded!.outputLang).toBe("kk");
    expect(loaded!.spikes).toHaveLength(1);
    expect(loaded!.spikes[0].spikeId).toBe("spike1");
    expect(loaded!.spikes[0].status).toBe("complete");
  });

  test("returns null for non-existent job", async () => {
    const loaded = await loadJobState("nonexistent_" + Date.now());
    expect(loaded).toBeNull();
  });

  test("updates updatedAt on save", async () => {
    const state: JobState = {
      transcriptionId: TEST_ID,
      url: "https://youtube.com/watch?v=test",
      spikes: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };

    await saveJobState(state);
    const loaded = await loadJobState(TEST_ID);

    expect(loaded!.updatedAt).not.toBe("2024-01-01T00:00:00.000Z");
    expect(new Date(loaded!.updatedAt).getTime()).toBeGreaterThan(new Date("2024-01-01").getTime());
  });
});

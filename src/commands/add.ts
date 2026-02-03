import { Command, Option } from "commander";
import { readFile } from "node:fs/promises";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { formatDuration, printJson, startSpinner } from "../lib/output";
import { extractId, extractStatus, pickValue } from "../lib/utils";
import { saveJobState, type JobState, type SpikeState } from "../lib/jobs";
import { streamSpikeToTerminal } from "./stream";

const YOUTUBE_URL_RE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts|live|embed)|youtu\.be\/)/i;

/** Default SSE idle timeout in ms */
const SSE_IDLE_TIMEOUT_MS = 30_000;

interface AddOptions {
  lang?: string;
  wait?: boolean;
  noWait?: boolean;
  json?: boolean;
  batch?: string;
  concurrency?: number;
  analyze?: string;
  spikes?: string;  // hidden alias for backwards compat
  stream?: boolean;
}

async function waitForCompletion(id: string, token: string, apiUrl: string) {
  const spinner = startSpinner("Processing...");
  const started = Date.now();
  const maxAttempts = 120;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = (await apiFetch(`/v1/status/${id}`, {
        token,
        apiUrl,
      })) as Record<string, unknown>;

      const status = extractStatus(response)?.toLowerCase() ?? "pending";
      const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
      spinner.text = `Processing... (${elapsedSeconds}s)`;

      if (status.includes("complete")) {
        const title = pickValue(response, ["title", "videoTitle", "name"]);
        const duration = formatDuration(
          (response.duration as number | string | undefined) ??
            (response.durationSec as number | undefined) ??
            (response.durationSeconds as number | undefined),
        );
        spinner.succeed(`Completed: ${title ? `"${title}"` : id} (${duration})`);
        return response;
      }

      if (status.includes("error") || status.includes("failed")) {
        spinner.fail(`Failed: ${id}`);
        return response;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    spinner.fail("Timed out waiting for transcription to complete.");
    return null;
  } catch (error) {
    spinner.fail((error as Error).message);
    return null;
  }
}

interface BatchResult {
  url: string;
  ok: boolean;
  id?: string;
  status?: string;
  error?: string;
  response?: Record<string, unknown>;
}

async function submitBatchUrl(
  url: string,
  token: string,
  apiUrl: string,
  outputLang: string | undefined,
): Promise<BatchResult> {
  if (!YOUTUBE_URL_RE.test(url)) {
    return { url, ok: false, error: "Not a valid YouTube URL." };
  }

  try {
    const response = (await apiFetch("/v1/add", {
      query: { url, outputLang },
      token,
      apiUrl,
    })) as Record<string, unknown>;

    const id = extractId(response);
    const status = extractStatus(response) ?? "pending";

    if (!id) {
      return { url, ok: false, error: "No ID returned.", response };
    }

    return { url, ok: true, id, status, response };
  } catch (error) {
    return { url, ok: false, error: (error as Error).message };
  }
}

async function runBatchAdd(
  filePath: string,
  options: AddOptions,
  command: Command,
): Promise<void> {
  const config = (await readConfig()) ?? {};
  const tokenOverride = getTokenOverride(options as { token?: string }, command);
  const { token, expired } = resolveToken(config, tokenOverride);

  if (!token) {
    console.error(expired ? "Token expired. Run `xevol login` to re-authenticate." : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
    process.exitCode = 1;
    return;
  }

  const concurrency = options.concurrency ?? 3;
  if (!Number.isFinite(concurrency) || concurrency < 1) {
    console.error(chalk.red("Error:") + " Concurrency must be a positive number.");
    process.exitCode = 1;
    return;
  }

  let rawFile = "";
  try {
    rawFile = await readFile(filePath, "utf8");
  } catch (error) {
    console.error(chalk.red("Error:") + ` Unable to read batch file: ${filePath}`);
    console.error((error as Error).message);
    process.exitCode = 1;
    return;
  }

  const urls = rawFile
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (urls.length === 0) {
    console.error(chalk.red("Error:") + " No URLs found in batch file.");
    process.exitCode = 1;
    return;
  }

  const apiUrl = resolveApiUrl(config);
  const outputLang = options.lang ?? "en";
  const results: BatchResult[] = new Array(urls.length);
  const logProgress = options.json ? (message: string) => console.error(message) : console.log;
  const workerCount = Math.min(concurrency, urls.length);
  let nextIndex = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= urls.length) break;

      const url = urls[index];
      const result = await submitBatchUrl(url, token, apiUrl, outputLang);
      results[index] = result;

      if (result.ok) {
        logProgress(`${chalk.green("✓")} ${url} → ${result.id}`);
      } else {
        logProgress(`${chalk.red("✗")} ${url} → ${result.error ?? "Unknown error"}`);
      }
    }
  });

  await Promise.all(workers);

  const successCount = results.filter((result) => result.ok).length;
  const failureCount = results.length - successCount;

  if (options.json) {
    printJson(results);
    console.error(`Summary: ${successCount} succeeded, ${failureCount} failed`);
    return;
  }

  console.log(`Summary: ${successCount} succeeded, ${failureCount} failed`);
}

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Submit a YouTube URL for transcription")
    .argument("<youtubeUrl>", "YouTube URL")
    .option("--lang <code>", "Output language", "en")
    .option("--batch <file>", "Read URLs from a file (one per line)")
    .option("--concurrency <n>", "Max parallel requests", (value) => Number.parseInt(value, 10), 3)
    .option("--no-wait", "Don't wait for completion (fire-and-forget)")
    .option("--analyze <prompts>", "Comma-separated prompt IDs to generate analysis after transcription")
    .addOption(new Option("--spikes <prompts>").hideHelp())
    .option("--stream", "Stream analysis content in real-time via SSE (use with --analyze)")
    .option("--json", "Raw JSON output")
    .addHelpText('after', `
Examples:
  $ xevol add "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  $ xevol add "https://youtu.be/dQw4w9WgXcQ" --lang kk
  $ xevol add "https://www.youtube.com/watch?v=..." --analyze review,summary --stream
  $ xevol add "https://www.youtube.com/watch?v=..." --no-wait
  $ xevol add --batch urls.txt --concurrency 5`)
    .action(async (youtubeUrl: string, options: AddOptions, command) => {
      try {
        if (options.batch) {
          await runBatchAdd(options.batch, options, command);
          return;
        }

        // Validate YouTube URL before doing anything
        if (!YOUTUBE_URL_RE.test(youtubeUrl)) {
          console.error(chalk.red("Error:") + " Not a valid YouTube URL. Expected youtube.com/watch?v=... or youtu.be/...");
          process.exitCode = 1;
          return;
        }

        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options as { token?: string }, command);
        const { token, expired } = resolveToken(config, tokenOverride);

        if (!token) {
          console.error(expired ? "Token expired. Run `xevol login` to re-authenticate." : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const response = (await apiFetch("/v1/add", {
          query: { url: youtubeUrl, outputLang: options.lang },
          token,
          apiUrl,
        })) as Record<string, unknown>;

        const id = extractId(response);
        const status = extractStatus(response) ?? "pending";

        if (!id) {
          if (options.json) {
            printJson(response);
          } else {
            console.error("Transcription created, but the response did not include an ID.");
          }
          process.exitCode = 1;
          return;
        }

        if (!options.json) {
          console.log(`${chalk.green("✔")} Transcription created: ${id}`);
          console.log(`Status: ${status}`);
        }

        // --analyze takes precedence, fall back to --spikes (hidden alias)
        const analyzeFlag = options.analyze ?? options.spikes;

        // Default: wait for completion. --no-wait skips.
        if (options.wait !== false) {
          const promptIds = analyzeFlag ? analyzeFlag.split(",").map((s) => s.trim()).filter(Boolean) : [];
          const totalSteps = 1 + promptIds.length;
          if (!options.json) {
            console.log(chalk.dim(`[1/${totalSteps}] Transcribing...`));
          }

          const finalResponse = await waitForCompletion(id, token, apiUrl);
          if (options.json && !analyzeFlag) {
            printJson(finalResponse ?? response);
          }

          // Generate analysis if requested
          if (analyzeFlag && finalResponse) {
            const status = extractStatus(finalResponse)?.toLowerCase() ?? "";
            if (!status.includes("complete")) {
              console.error(chalk.red("Error:") + " Transcription did not complete — skipping analysis generation.");
            } else if (options.stream) {
              // === STREAMING MODE ===
              const lang = options.lang ?? "en";
              const spikeResults: Record<string, unknown>[] = [];

              // Initialize job state for resume
              const jobState: JobState = {
                transcriptionId: id,
                url: youtubeUrl,
                lang: lang,
                outputLang: lang,
                spikes: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              for (let i = 0; i < promptIds.length; i++) {
                const promptId = promptIds[i];
                const stepNum = i + 2; // step 1 was transcription
                if (!options.json) {
                  console.log(chalk.dim(`[${stepNum}/${totalSteps}] Generating analysis: ${promptId}...`));
                }
                const spinner = startSpinner(`Creating analysis: ${promptId}...`);

                try {
                  // Create spike via POST
                  const spikeResponse = (await apiFetch(`/spikes/${id}`, {
                    method: "POST",
                    body: { promptId, outputLang: lang },
                    token,
                    apiUrl,
                  })) as Record<string, unknown>;

                  const spikeId = spikeResponse.spikeId as string;

                  // Track in job state
                  const spikeState: SpikeState = {
                    spikeId: spikeId ?? promptId,
                    promptId,
                    status: "pending",
                  };
                  jobState.spikes.push(spikeState);

                  // If content already cached, print and skip streaming
                  const cachedContent =
                    (spikeResponse.content as string) ??
                    (spikeResponse.markdown as string);
                  if (cachedContent) {
                    spinner.succeed(`Analysis ready: ${promptId} (cached)`);
                    if (!options.json) {
                      console.log(chalk.bold.cyan(`\n─── ${promptId} ───`));
                      console.log(cachedContent);
                    }
                    spikeState.status = "complete";
                    await saveJobState(jobState);
                    spikeResults.push(spikeResponse);
                    continue;
                  }

                  if (!spikeId) {
                    spinner.fail(`No analysis ID returned for ${promptId}`);
                    spikeState.status = "error";
                    await saveJobState(jobState);
                    continue;
                  }

                  spinner.succeed(`Analysis created: ${promptId}`);
                  spikeState.status = "streaming";
                  await saveJobState(jobState);

                  // Stream content via SSE
                  const result = await streamSpikeToTerminal(spikeId, token, apiUrl, {
                    json: options.json,
                    header: promptId,
                  });

                  spikeState.status = "complete";
                  spikeState.lastEventId = result.lastEventId;
                  await saveJobState(jobState);

                  if (!options.json) {
                    console.log(chalk.green(`✔ Analysis complete: ${promptId}`));
                  }
                  spikeResults.push({ spikeId, promptId, content: result.content });
                } catch (error) {
                  spinner.fail(`Analysis failed: ${promptId} — ${(error as Error).message}`);
                  const existingSpike = jobState.spikes.find((s) => s.promptId === promptId);
                  if (existingSpike) {
                    existingSpike.status = "error";
                    await saveJobState(jobState);
                  }
                }
              }

              if (!options.json) {
                console.log(chalk.green(`\n✔ All done. Resume anytime: xevol resume ${id}`));
              } else {
                printJson({ transcription: finalResponse, spikes: spikeResults });
              }
            } else {
              // === POLLING MODE (existing behavior) ===
              const lang = options.lang ?? "en";
              const spikeResults: Record<string, unknown>[] = [];

              for (let i = 0; i < promptIds.length; i++) {
                const promptId = promptIds[i];
                const stepNum = i + 2;
                if (!options.json) {
                  console.log(chalk.dim(`[${stepNum}/${totalSteps}] Generating analysis: ${promptId}...`));
                }
                const spinner = startSpinner(`Generating analysis: ${promptId}...`);
                const started = Date.now();
                const maxAttempts = 120;

                try {
                  // POST to create/fetch spike
                  let spikeResponse = (await apiFetch(`/spikes/${id}`, {
                    method: "POST",
                    body: { promptId, outputLang: lang },
                    token,
                    apiUrl,
                  })) as Record<string, unknown>;

                  // Poll if spike is being generated
                  const spikes = (spikeResponse.spikes as unknown[] | undefined) ??
                    (spikeResponse.data as unknown[] | undefined) ??
                    (spikeResponse.items as unknown[] | undefined);

                  if ((!spikes || (Array.isArray(spikes) && spikes.length === 0)) && spikeResponse.spikeId) {
                    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                      await new Promise((resolve) => setTimeout(resolve, 5000));
                      const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
                      spinner.text = `Generating analysis: ${promptId}... (${elapsedSeconds}s)`;

                      spikeResponse = (await apiFetch(`/spikes/${id}`, {
                        method: "POST",
                        body: { promptId, outputLang: lang },
                        token,
                        apiUrl,
                      })) as Record<string, unknown>;

                      const content = spikeResponse.content ?? spikeResponse.markdown ?? spikeResponse.text;
                      const innerSpikes = (spikeResponse.spikes as unknown[] | undefined) ??
                        (spikeResponse.data as unknown[] | undefined);
                      if (content || (Array.isArray(innerSpikes) && innerSpikes.length > 0)) {
                        break;
                      }
                    }
                  }

                  spinner.succeed(`Analysis ready: ${promptId}`);
                  spikeResults.push(spikeResponse);
                } catch (error) {
                  spinner.fail(`Analysis failed: ${promptId} — ${(error as Error).message}`);
                }
              }

              if (options.json) {
                printJson({ transcription: finalResponse, spikes: spikeResults });
              }
            }
          }
          return;
        }

        if (options.json) {
          printJson(response);
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}

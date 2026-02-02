import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { formatDuration, printJson, startSpinner } from "../lib/output";
import { extractId, extractStatus, pickValue } from "../lib/utils";

interface AddOptions {
  lang?: string;
  wait?: boolean;
  json?: boolean;
  spikes?: string;
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

export function registerAddCommand(program: Command): void {
  program
    .command("add")
    .description("Submit a YouTube URL for transcription")
    .argument("<youtubeUrl>", "YouTube URL")
    .option("--lang <code>", "Output language", "en")
    .option("--wait", "Wait for completion")
    .option("--spikes <prompts>", "Comma-separated prompt IDs to generate spikes after transcription (requires --wait)")
    .option("--json", "Raw JSON output")
    .action(async (youtubeUrl: string, options: AddOptions, command) => {
      try {
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
          console.log(`${chalk.green("✓")} Transcription created: ${id}`);
          console.log(`Status: ${status}`);
        }

        if (options.wait) {
          const finalResponse = await waitForCompletion(id, token, apiUrl);
          if (options.json && !options.spikes) {
            printJson(finalResponse ?? response);
          }

          // Generate spikes if requested
          if (options.spikes && finalResponse) {
            const status = extractStatus(finalResponse)?.toLowerCase() ?? "";
            if (!status.includes("complete")) {
              console.error("Transcription did not complete — skipping spike generation.");
            } else {
              const promptIds = options.spikes.split(",").map((s) => s.trim()).filter(Boolean);
              const lang = options.lang ?? "en";
              const spikeResults: Record<string, unknown>[] = [];

              for (const promptId of promptIds) {
                const spinner = startSpinner(`Generating spike: ${promptId}...`);
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
                      spinner.text = `Generating spike: ${promptId}... (${elapsedSeconds}s)`;

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

                  spinner.succeed(`Spike ready: ${promptId}`);
                  spikeResults.push(spikeResponse);
                } catch (error) {
                  spinner.fail(`Spike failed: ${promptId} — ${(error as Error).message}`);
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

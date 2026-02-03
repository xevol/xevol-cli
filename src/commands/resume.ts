import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { loadJobState, saveJobState } from "../lib/jobs";
import { printJson, startSpinner } from "../lib/output";
import { streamSpikeToTerminal } from "./stream";

interface ResumeOptions {
  json?: boolean;
}

export function registerResumeCommand(program: Command): void {
  program
    .command("resume")
    .description("Resume a previous streaming session")
    .argument("<id>", "Transcription ID")
    .option("--json", "Raw JSON output")
    .action(async (id: string, options: ResumeOptions, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options as { token?: string }, command);
        const { token, expired } = resolveToken(config, tokenOverride);

        if (!token) {
          console.error(
            expired
              ? "Token expired. Run `xevol login` to re-authenticate."
              : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
          );
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const jobState = await loadJobState(id);

        if (!jobState) {
          console.error(
            chalk.red(`No job state found for ${id}.`),
            "\nMake sure you previously ran `xevol add --stream --analyze` for this transcription.",
          );
          process.exitCode = 1;
          return;
        }

        const lang = jobState.lang ?? jobState.outputLang ?? "en";

        if (!options.json) {
        }

        const results: Record<string, unknown>[] = [];

        for (const spike of jobState.spikes) {
          if (spike.status === "complete") {
            // Fetch cached content from API
            if (!options.json) {
            }

            try {
              const spikeResponse = (await apiFetch(`/spikes/${id}`, {
                method: "POST",
                body: { promptId: spike.promptId, outputLang: lang },
                token,
                apiUrl,
              })) as Record<string, unknown>;

              if (options.json) {
                results.push(spikeResponse);
              } else {
                const content =
                  (spikeResponse.content as string) ??
                  (spikeResponse.markdown as string) ??
                  (spikeResponse.text as string) ??
                  "";
                if (content) {
                }
              }
            } catch (error) {
              console.error(chalk.red(`Failed to fetch ${spike.promptId}: ${(error as Error).message}`));
            }
            continue;
          }

          if (spike.status === "streaming") {
            // Reconnect to SSE with Last-Event-ID
            if (!options.json) {
            }

            try {
              const result = await streamSpikeToTerminal(spike.spikeId, token, apiUrl, {
                json: options.json,
                lastEventId: spike.lastEventId,
                header: spike.promptId,
              });

              spike.status = "complete";
              spike.lastEventId = result.lastEventId;
              await saveJobState(jobState);

              if (!options.json) {
              } else {
                results.push({ spikeId: spike.spikeId, promptId: spike.promptId, content: result.content });
              }
            } catch (error) {
              console.error(chalk.red(`Analysis stream failed for ${spike.promptId}: ${(error as Error).message}`));
              spike.status = "error";
              await saveJobState(jobState);
            }
            continue;
          }

          // Pending spike — kick it off and stream
          if (spike.status === "pending" || spike.status === "error") {
            const spinner = startSpinner(`Starting analysis: ${spike.promptId}...`);

            try {
              const spikeResponse = (await apiFetch(`/spikes/${id}`, {
                method: "POST",
                body: { promptId: spike.promptId, outputLang: lang },
                token,
                apiUrl,
              })) as Record<string, unknown>;

              const spikeId = (spikeResponse.spikeId as string) ?? spike.spikeId;
              spike.spikeId = spikeId;

              // If content already available (cached), print it
              const cachedContent = (spikeResponse.content as string) ?? (spikeResponse.markdown as string);
              if (cachedContent) {
                spinner.succeed(`Analysis ready: ${spike.promptId}`);
                if (!options.json) {
                }
                spike.status = "complete";
                await saveJobState(jobState);
                if (options.json) {
                  results.push(spikeResponse);
                }
                continue;
              }

              spinner.succeed(`Analysis started: ${spike.promptId}`);
              spike.status = "streaming";
              await saveJobState(jobState);

              const result = await streamSpikeToTerminal(spikeId, token, apiUrl, {
                json: options.json,
                header: spike.promptId,
              });

              spike.status = "complete";
              spike.lastEventId = result.lastEventId;
              await saveJobState(jobState);

              if (!options.json) {
              } else {
                results.push({ spikeId, promptId: spike.promptId, content: result.content });
              }
            } catch (error) {
              spinner.fail(`Failed: ${spike.promptId} — ${(error as Error).message}`);
              spike.status = "error";
              await saveJobState(jobState);
            }
          }
        }

        if (options.json) {
          printJson({ transcriptionId: id, spikes: results });
        } else {
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exitCode = 1;
      }
    });
}

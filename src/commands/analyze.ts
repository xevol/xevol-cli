import chalk from "chalk";
import type { Command } from "commander";
import { streamSpikeToTerminal } from "../commands/stream";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { divider, printJson, startSpinner } from "../lib/output";

interface SpikesOptions {
  generate?: boolean;
  prompt?: string;
  lang?: string;
  json?: boolean;
  stream?: boolean;
}

function extractResults(response: Record<string, unknown>): Record<string, unknown>[] {
  const results =
    (response.spikes as Record<string, unknown>[] | undefined) ??
    (response.data as Record<string, unknown>[] | undefined) ??
    (response.items as Record<string, unknown>[] | undefined);

  if (Array.isArray(results)) return results;

  if (response.content || response.markdown || response.text) {
    return [response];
  }

  return [];
}

function extractResultText(result: Record<string, unknown>): string | undefined {
  const value =
    (result.markdown as string | undefined) ??
    (result.content as string | undefined) ??
    (result.text as string | undefined) ??
    (result.body as string | undefined);
  return value;
}

async function fetchAnalysis(
  transcriptionId: string,
  token: string,
  apiUrl: string,
  promptId = "review",
  outputLang = "en",
) {
  // POST /spikes/:id both creates and returns analysis (idempotent).
  // If analysis with the same promptId+outputLang already exists, the API returns it directly.
  return (await apiFetch(`/spikes/${transcriptionId}`, {
    method: "POST",
    body: { promptId, outputLang },
    token,
    apiUrl,
  })) as Record<string, unknown>;
}

async function waitForAnalysis(
  transcriptionId: string,
  token: string,
  apiUrl: string,
  promptId = "review",
  outputLang = "en",
) {
  const spinner = startSpinner("Generating analysis...");
  const started = Date.now();
  const maxAttempts = 120;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetchAnalysis(transcriptionId, token, apiUrl, promptId, outputLang);
      const results = extractResults(response);

      const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
      spinner.text = `Generating analysis... (${elapsedSeconds}s)`;

      if (results.length > 0) {
        spinner.succeed("Analysis ready");
        return response;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    spinner.fail("Timed out waiting for analysis to generate.");
    return null;
  } catch (error) {
    spinner.fail((error as Error).message);
    return null;
  }
}

export function registerAnalyzeCommand(program: Command): void {
  program
    .command("analyze")
    .alias("spikes")
    .description("View or generate analysis for a transcription")
    .argument("<id>", "Transcription ID")
    .option("--generate", "Generate analysis if missing")
    .option("--prompt <id>", "Prompt ID for generation")
    .option("--lang <code>", "Output language", "en")
    .option("--json", "Raw JSON output")
    .option("--no-stream", "Disable live streaming (use polling instead)")
    .addHelpText(
      "after",
      `
Examples:
  $ xevol analyze abc123
  $ xevol analyze abc123 --prompt facts --lang kk
  $ xevol analyze abc123 --generate --prompt review --json`,
    )
    .action(async (id: string, options: SpikesOptions, command) => {
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
        const promptId = options.prompt ?? "review";
        const lang = options.lang ?? "en";

        // POST is idempotent — returns existing analysis or creates + queues a new one
        let response = await fetchAnalysis(id, token, apiUrl, promptId, lang);
        let results = extractResults(response);

        // If we got a spikeId but no content, the analysis is being generated
        const spikeId = response.spikeId as string | undefined;
        const useStreaming = options.stream !== false && !options.json;

        if (results.length === 0 && spikeId) {
          if (useStreaming) {
            // Print title/header before streaming
            const title =
              (response.title as string | undefined) ?? (response.transcriptionTitle as string | undefined) ?? id;

            console.log(chalk.bold(`Analysis for "${title}"`));
            console.log(divider());

            const result = await streamSpikeToTerminal(spikeId, token, apiUrl);
            if (!result.content) {
              console.log("No analysis content available.");
            }
            return;
          }

          // Polling fallback (--no-stream or --json)
          const finalResponse = await waitForAnalysis(id, token, apiUrl, promptId, lang);
          if (!finalResponse) {
            process.exitCode = 1;
            return;
          }
          response = finalResponse;
          results = extractResults(response);
        }

        if (options.json) {
          printJson(response);
          return;
        }

        const title =
          (response.title as string | undefined) ??
          (response.transcriptionTitle as string | undefined) ??
          (results[0]?.title as string | undefined) ??
          id;

        console.log(chalk.bold(`Analysis for "${title}"`));
        console.log(divider());

        const content = results
          .map((result) => extractResultText(result))
          .filter((value): value is string => Boolean(value))
          .join("\n\n");

        if (content) {
          console.log(content);
        } else {
          console.log("No analysis content available.");
        }
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

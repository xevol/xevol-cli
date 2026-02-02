import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { divider, printJson, startSpinner } from "../lib/output";

interface SpikesOptions {
  generate?: boolean;
  prompt?: string;
  lang?: string;
  json?: boolean;
}

function extractSpikes(response: Record<string, unknown>): Record<string, unknown>[] {
  const spikes =
    (response.spikes as Record<string, unknown>[] | undefined) ??
    (response.data as Record<string, unknown>[] | undefined) ??
    (response.items as Record<string, unknown>[] | undefined);

  if (Array.isArray(spikes)) return spikes;

  if (response.content || response.markdown || response.text) {
    return [response];
  }

  return [];
}

function extractSpikeText(spike: Record<string, unknown>): string | undefined {
  const value =
    (spike.markdown as string | undefined) ??
    (spike.content as string | undefined) ??
    (spike.text as string | undefined) ??
    (spike.body as string | undefined);
  return value;
}

async function fetchSpikes(transcriptionId: string, token: string, apiUrl: string) {
  return (await apiFetch("/spikes", {
    query: { transcriptionId },
    token,
    apiUrl,
  })) as Record<string, unknown>;
}

async function waitForSpikes(transcriptionId: string, token: string, apiUrl: string) {
  const spinner = startSpinner("Generating spikes...");
  const started = Date.now();
  const maxAttempts = 120;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetchSpikes(transcriptionId, token, apiUrl);
      const spikes = extractSpikes(response);

      const elapsedSeconds = Math.floor((Date.now() - started) / 1000);
      spinner.text = `Generating spikes... (${elapsedSeconds}s)`;

      if (spikes.length > 0) {
        spinner.succeed("Spikes ready");
        return response;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    spinner.fail("Timed out waiting for spikes to generate.");
    return null;
  } catch (error) {
    spinner.fail((error as Error).message);
    return null;
  }
}

export function registerSpikesCommand(program: Command): void {
  program
    .command("spikes")
    .description("View or generate spikes for a transcription")
    .argument("<id>", "Transcription ID")
    .option("--generate", "Generate spikes if missing")
    .option("--prompt <id>", "Prompt ID for generation")
    .option("--lang <code>", "Output language", "en")
    .option("--json", "Raw JSON output")
    .action(async (id: string, options: SpikesOptions, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options as { token?: string }, command);
        const token = resolveToken(config, tokenOverride);

        if (!token) {
          console.error("Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        let response = await fetchSpikes(id, token, apiUrl);
        let spikes = extractSpikes(response);

        if (spikes.length === 0) {
          if (!options.generate) {
            if (options.json) {
              printJson(response);
              return;
            }
            console.log(`No spikes found for ${id}.`);
            console.log("Generate with: xevol spikes " + id + " --generate --prompt <promptId>");
            return;
          }

          if (!options.prompt) {
            console.error("--prompt is required to generate spikes.");
            process.exitCode = 1;
            return;
          }

          await apiFetch(`/spikes/${id}`, {
            method: "POST",
            body: { promptId: options.prompt, outputLang: options.lang },
            token,
            apiUrl,
          });

          const finalResponse = await waitForSpikes(id, token, apiUrl);
          if (!finalResponse) {
            process.exitCode = 1;
            return;
          }
          response = finalResponse;
          spikes = extractSpikes(response);
        }

        if (options.json) {
          printJson(response);
          return;
        }

        const title =
          (response.title as string | undefined) ??
          (response.transcriptionTitle as string | undefined) ??
          (spikes[0]?.title as string | undefined) ??
          id;

        console.log(chalk.bold(`Spikes for "${title}"`));
        console.log(divider());

        const content = spikes
          .map((spike) => extractSpikeText(spike))
          .filter((value): value is string => Boolean(value))
          .join("\n\n");

        if (content) {
          console.log(content);
        } else {
          console.log("No spike content available.");
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}

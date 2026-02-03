import { createInterface } from "node:readline";
import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { printJson, startSpinner } from "../lib/output";

interface DeleteOptions {
  force?: boolean;
  json?: boolean;
}

async function confirmDelete(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("Are you sure? ", (value) => resolve(value));
  });
  rl.close();
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

export function registerDeleteCommand(program: Command): void {
  program
    .command("delete")
    .description("Delete a transcription")
    .argument("<id>", "Transcription ID")
    .option("--force", "Skip confirmation")
    .option("--json", "Raw JSON output")
    .action(async (id: string, options: DeleteOptions, command) => {
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

        if (!options.force) {
          const confirmed = await confirmDelete();
          if (!confirmed) {
            console.error("Aborted.");
            process.exitCode = 1;
            return;
          }
        }

        const apiUrl = resolveApiUrl(config);
        const spinner = startSpinner("Deleting transcription…");

        const response = (await apiFetch(`/v1/transcriptions/${id}`, {
          method: "DELETE",
          token,
          apiUrl,
        })) as Record<string, unknown>;

        spinner.stop();

        if (options.json) {
          printJson(response);
          return;
        }
      } catch (error) {
        console.error(`${chalk.red("Error:")} ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}

import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { printJson, renderTable } from "../lib/output";

interface PromptsOptions {
  json?: boolean;
  csv?: boolean;
}

interface PromptItem {
  id: string;
  name: string | null;
  description: string | null;
}

export function registerPromptsCommand(program: Command): void {
  program
    .command("prompts")
    .description("List available prompts")
    .option("--json", "Raw JSON output")
    .option("--csv", "CSV output")
    .action(async (options: PromptsOptions, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options as { token?: string }, command);
        const { token } = resolveToken(config, tokenOverride);
        const apiUrl = resolveApiUrl(config);

        const response = (await apiFetch("/v1/prompts", {
          token: token ?? undefined,
          apiUrl,
        })) as { prompts: PromptItem[] };

        const items = response.prompts ?? [];

        if (options.json) {
          printJson(response);
          return;
        }

        if (options.csv) {
          const csvQuote = (v: string) => {
            const sanitized = v.replace(/\n/g, ' ');
            return sanitized.includes(',') || sanitized.includes('"')
              ? `"${sanitized.replace(/"/g, '""')}"`
              : sanitized;
          };
          console.log("ID,Description");
          for (const item of items) {
            console.log([item.id, item.description ?? "—"].map(csvQuote).join(","));
          }
          return;
        }

        console.log(chalk.bold(`Available Prompts (${items.length} total)`));
        console.log("");

        if (items.length === 0) {
          console.log("No prompts found.");
          return;
        }

        const truncate = (s: string, max: number) => {
          const oneLine = s.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
          return oneLine.length > max ? oneLine.slice(0, max - 1) + "…" : oneLine;
        };
        const rows = items.map((item) => [item.id, item.description ? truncate(item.description, 60) : "—"]);
        console.log(renderTable(["ID", "Description"], rows));
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

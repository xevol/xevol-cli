import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { printJson, startSpinner } from "../lib/output";

interface UsageOptions {
  json?: boolean;
}

export function registerUsageCommand(program: Command): void {
  program
    .command("usage")
    .description("Show usage stats and subscription info")
    .option("--json", "Raw JSON output")
    .action(async (options: UsageOptions, command) => {
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
        const spinner = startSpinner("Fetching usage data…");

        const data = (await apiFetch("/auth/cli/status", {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        spinner.stop();

        if (options.json) {
          printJson(data);
          return;
        }

        const _plan = (data.plan as string) ?? "free";
        const _status = (data.status as string) ?? "active";
        const _period = (data.period as string) ?? "month";
        const email = (data.email as string) ?? "";
        const usage = (data.usage as Record<string, number>) ?? {};
        const limits = (data.limits as Record<string, number>) ?? {};
        const periodEnd = data.current_period_end as string | null;

        const _txCount = usage.transcriptions ?? 0;
        const _txLimit = limits.transcriptions ?? "∞";
        if (email) {
        }
        if (periodEnd) {
          const endDate = new Date(periodEnd);
          if (!Number.isNaN(endDate.getTime())) {
            const _daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000));
          }
        }
      } catch (error) {
        console.error(`${chalk.red("Error:")} ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}

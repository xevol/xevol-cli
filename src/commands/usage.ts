import { Command } from "commander";
import chalk from "chalk";
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
              : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN."
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

        const plan = (data.plan as string) ?? "free";
        const status = (data.status as string) ?? "active";
        const period = (data.period as string) ?? "month";
        const email = (data.email as string) ?? "";
        const usage = (data.usage as Record<string, number>) ?? {};
        const limits = (data.limits as Record<string, number>) ?? {};
        const periodEnd = data.current_period_end as string | null;

        const txCount = usage.transcriptions ?? 0;
        const txLimit = limits.transcriptions ?? "∞";

        console.log("");
        console.log(`  ${chalk.bold("Usage & Subscription")}`);
        console.log("");
        if (email) {
          console.log(`  ${chalk.dim("Email:")}      ${email}`);
        }
        console.log(`  ${chalk.dim("Plan:")}       ${plan}`);
        console.log(`  ${chalk.dim("Status:")}     ${status}`);
        console.log(`  ${chalk.dim("Usage:")}      ${txCount} / ${txLimit} transcriptions (this ${period})`);
        if (periodEnd) {
          const endDate = new Date(periodEnd);
          if (!Number.isNaN(endDate.getTime())) {
            const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000));
            console.log(`  ${chalk.dim("Renews:")}     ${endDate.toLocaleDateString()} (${daysLeft} days)`);
          }
        }
        console.log("");
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

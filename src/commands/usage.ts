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

        const [usageResponse, subscriptionResponse] = await Promise.allSettled([
          apiFetch("/v1/usage", { token, apiUrl }) as Promise<Record<string, unknown>>,
          apiFetch("/v1/subscription", { token, apiUrl }) as Promise<Record<string, unknown>>,
        ]);

        spinner.stop();

        const usage =
          usageResponse.status === "fulfilled" ? usageResponse.value : null;
        const subscription =
          subscriptionResponse.status === "fulfilled" ? subscriptionResponse.value : null;

        if (options.json) {
          printJson({ usage, subscription });
          return;
        }

        // Extract fields with flexible paths
        const plan =
          (subscription as any)?.plan?.name ??
          (subscription as any)?.planName ??
          (subscription as any)?.plan ??
          "Free";

        const count =
          (usage as any)?.count ??
          (usage as any)?.transcriptionsThisMonth ??
          (usage as any)?.total ??
          0;

        const limit =
          (subscription as any)?.plan?.limit ??
          (subscription as any)?.planLimit ??
          (subscription as any)?.limit ??
          "∞";

        const status =
          (subscription as any)?.status ??
          (subscription as any)?.plan?.status ??
          "active";

        console.log("");
        console.log(`  ${chalk.bold("Usage & Subscription")}`);
        console.log("");
        console.log(`  ${chalk.dim("Plan:")}       ${plan}`);
        console.log(`  ${chalk.dim("Status:")}     ${status}`);
        console.log(`  ${chalk.dim("Usage:")}      ${count} / ${limit} transcriptions (last 30 days)`);

        if (usage && !subscription) {
          console.log("");
          console.log(chalk.dim("  ⚠ Could not fetch subscription details"));
        }
        if (!usage && subscription) {
          console.log("");
          console.log(chalk.dim("  ⚠ Could not fetch usage details"));
        }
        if (!usage && !subscription) {
          console.log("");
          console.log(chalk.yellow("  Could not fetch usage or subscription data."));
        }

        console.log("");
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

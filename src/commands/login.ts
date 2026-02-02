import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { clearConfig, readConfig, resolveApiUrl, resolveToken, updateConfig } from "../lib/config";
import { printJson } from "../lib/output";

function getTokenOverride(options: { token?: string }, command: Command): string | undefined {
  if (options.token) return options.token;
  const globals = typeof command.optsWithGlobals === "function" ? command.optsWithGlobals() : command.parent?.opts() ?? {};
  return globals.token as string | undefined;
}

function pickSessionField(data: Record<string, unknown>, key: string): string | undefined {
  const direct = data[key];
  if (typeof direct === "string") return direct;
  const nested = (data.session as Record<string, unknown> | undefined)?.[key];
  if (typeof nested === "string") return nested;
  return undefined;
}

function formatWhoami(data: Record<string, unknown>): string {
  const email = pickSessionField(data, "email") ?? "Unknown";
  const plan =
    (data.plan as { name?: string } | undefined)?.name ??
    (data.subscription as { plan?: string } | undefined)?.plan ??
    (data.plan as string | undefined);
  const usage =
    (data.usage as { transcriptionsThisMonth?: number } | undefined)?.transcriptionsThisMonth ??
    (data.monthly as { transcriptions?: number } | undefined)?.transcriptions ??
    (data.transcriptionsThisMonth as number | undefined);

  if (plan && usage !== undefined) {
    return `${email} (${plan} plan, ${usage} transcriptions this month)`;
  }
  if (plan) {
    return `${email} (${plan} plan)`;
  }
  return email;
}

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Authenticate with a CLI token")
    .option("--token <token>", "CLI token (overrides XEVOL_TOKEN)")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const token = resolveToken(config, tokenOverride);

        if (!token) {
          console.error(
            "Token required. Device auth flow is not available yet. Use --token <token> or set XEVOL_TOKEN.",
          );
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const session = (await apiFetch("/auth/session", {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        const accountId = pickSessionField(session, "accountId");
        const email = pickSessionField(session, "email");
        const expiresAt = pickSessionField(session, "expiresAt");

        await updateConfig({
          apiUrl,
          token,
          accountId: accountId ?? config.accountId,
          email: email ?? config.email,
          expiresAt: expiresAt ?? config.expiresAt,
        });

        if (options.json) {
          printJson(session);
          return;
        }

        const label = email ? `Logged in as ${chalk.bold(email)}` : "Logged in";
        console.log(`${chalk.green("✓")} ${label}`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  program
    .command("logout")
    .description("Revoke CLI token and clear local config")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const token = resolveToken(config, tokenOverride);

        if (!token) {
          console.log("You are not logged in.");
          return;
        }

        const apiUrl = resolveApiUrl(config);
        let response: unknown = { ok: true };

        try {
          response = await apiFetch("/auth/cli/revoke", { method: "POST", token, apiUrl });
        } catch (error) {
          response = { error: (error as Error).message };
        }

        await clearConfig();

        if (options.json) {
          printJson(response);
          return;
        }

        console.log(`${chalk.green("✓")} Logged out`);
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  program
    .command("whoami")
    .description("Show the current authenticated account")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const token = resolveToken(config, tokenOverride);

        if (!token) {
          console.error("Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const session = (await apiFetch("/auth/session", {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        if (options.json) {
          printJson(session);
          return;
        }

        console.log(formatWhoami(session));
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}

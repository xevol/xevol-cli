import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { clearConfig, getTokenOverride, readConfig, resolveApiUrl, resolveToken, updateConfig } from "../lib/config";
import { printJson, startSpinner } from "../lib/output";
import { pickNumberField, pickSessionField } from "../lib/utils";

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

function formatExpiry(expiresInSeconds: number): string {
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return "soon";
  if (expiresInSeconds < 90) return `${Math.ceil(expiresInSeconds)} sec`;
  const minutes = Math.ceil(expiresInSeconds / 60);
  return `${minutes} min`;
}

async function openBrowser(url: string): Promise<void> {
  try {
    const { execFile } = await import("child_process");
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(opener, [url], (err) => {
      // Best-effort; user still has the printed URL.
    });
  } catch {
    // Best-effort; user still has the printed URL.
  }
}

async function readErrorMessage(response: Response): Promise<string | null> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { message?: string; error?: string };
      return data.message ?? data.error ?? JSON.stringify(data);
    }
    const text = await response.text();
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

async function sleep(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("Authenticate with the browser-based device flow")
    .option("--token <token>", "CLI token (overrides XEVOL_TOKEN)")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const apiUrl = resolveApiUrl(config);

        if (tokenOverride) {
          const token = resolveToken(config, tokenOverride);
          if (!token) {
            console.error("Token required. Use --token <token> or set XEVOL_TOKEN.");
            process.exitCode = 1;
            return;
          }

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
          return;
        }

        const deviceCodeUrl = new URL("/auth/cli/device-code", apiUrl);
        const deviceResponse = await fetch(deviceCodeUrl, { method: "POST" });
        if (!deviceResponse.ok) {
          const details = await readErrorMessage(deviceResponse);
          const message = details
            ? `API ${deviceResponse.status}: ${details}`
            : `API ${deviceResponse.status} ${deviceResponse.statusText}`;
          throw new Error(message);
        }

        const deviceData = (await deviceResponse.json()) as Record<string, unknown>;
        const deviceCode = pickSessionField(deviceData, "deviceCode");
        const userCode = pickSessionField(deviceData, "userCode");
        const verificationUrl = pickSessionField(deviceData, "verificationUrl");
        const expiresIn = pickNumberField(deviceData, "expiresIn");
        const interval = pickNumberField(deviceData, "interval");

        if (!deviceCode || !userCode || !verificationUrl || !expiresIn || !interval) {
          throw new Error("Invalid device authorization response.");
        }

        const verificationLink = new URL(verificationUrl);
        verificationLink.searchParams.set("code", userCode);

        await openBrowser(verificationLink.toString());

        console.log("Open this URL to authenticate:");
        console.log(`  ${verificationLink.toString()}`);
        console.log("");
        console.log(`Waiting for approval... (expires in ${formatExpiry(expiresIn)})`);

        const spinner = startSpinner("Waiting for approval...");
        const expiresAt = Date.now() + expiresIn * 1000;
        const intervalMs = Math.max(1, interval) * 1000;
        const deviceTokenUrl = new URL("/auth/cli/device-token", apiUrl);

        try {
          while (Date.now() < expiresAt) {
            const pollResponse = await fetch(deviceTokenUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceCode }),
            });

            if (pollResponse.status === 202) {
              await sleep(intervalMs);
              continue;
            }

            if (pollResponse.status === 400) {
              const details = await readErrorMessage(pollResponse);
              spinner.fail("Device authorization expired.");
              console.error(details ?? "Device authorization expired. Run xevol login again.");
              process.exitCode = 1;
              return;
            }

            if (pollResponse.ok) {
              const tokenData = (await pollResponse.json()) as Record<string, unknown>;
              const token = pickSessionField(tokenData, "token");
              const accountId = pickSessionField(tokenData, "accountId");
              const email = pickSessionField(tokenData, "email");
              const tokenExpiresAt = pickSessionField(tokenData, "expiresAt");

              if (!token) {
                spinner.fail("Authentication failed.");
                throw new Error("No token received from device authorization.");
              }

              await updateConfig({
                apiUrl,
                token,
                accountId: accountId ?? config.accountId,
                email: email ?? config.email,
                expiresAt: tokenExpiresAt ?? config.expiresAt,
              });

              spinner.succeed("Approved");

              if (options.json) {
                printJson(tokenData);
                return;
              }

              const label = email ? `Logged in as ${chalk.bold(email)}` : "Logged in";
              console.log(`${chalk.green("✓")} ${label}`);
              return;
            }

            const details = await readErrorMessage(pollResponse);
            spinner.fail("Authentication failed.");
            const message = details
              ? `API ${pollResponse.status}: ${details}`
              : `API ${pollResponse.status} ${pollResponse.statusText}`;
            throw new Error(message);
          }

          const timeoutMessage = "Device authorization timed out. Run xevol login again.";
          spinner.fail("Timed out.");
          console.error(timeoutMessage);
          process.exitCode = 1;
        } catch (error) {
          if (spinner.isSpinning) {
            spinner.fail("Authentication failed.");
          }
          throw error;
        }
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
        const storedToken = config.token;
        const token = storedToken ?? resolveToken(config, tokenOverride);

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
          console.error("Not logged in. Use xevol login to authenticate.");
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

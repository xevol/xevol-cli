import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { clearConfig, getTokenOverride, readConfig, resolveApiUrl, resolveToken, updateConfig } from "../lib/config";
import { printJson, startSpinner } from "../lib/output";
import { pickNumberField, pickSessionField } from "../lib/utils";

/**
 * Format the whoami output from the /auth/session response.
 *
 * The session response shape varies between browser sessions and CLI tokens,
 * and the plan/usage data may come from different fields depending on
 * what the API returns. This function tries multiple paths to extract the data.
 */
function _formatWhoami(data: Record<string, unknown>): string {
  // Email could be at data.email, data.user.email, or data.session.email
  const email = pickSessionField(data, "email") ?? "Unknown";

  // Plan name might be nested differently depending on whether the API
  // returns enriched subscription data or just the basic session
  const plan =
    (data.plan as { name?: string } | undefined)?.name ??
    (data.subscription as { plan?: string } | undefined)?.plan ??
    (data.plan as string | undefined);

  // Usage count — same flexibility for different response shapes
  const usage =
    (data.usage as { transcriptionsThisMonth?: number } | undefined)?.transcriptionsThisMonth ??
    (data.monthly as { transcriptions?: number } | undefined)?.transcriptions ??
    (data.transcriptionsThisMonth as number | undefined);

  const lines: string[] = [];
  lines.push(`${chalk.dim("Email:")}    ${chalk.bold(email)}`);
  if (plan) {
    lines.push(`${chalk.dim("Plan:")}     ${plan}`);
  }
  if (usage !== undefined) {
    lines.push(`${chalk.dim("Usage:")}    ${usage} transcriptions this month`);
  }
  return lines.join("\n");
}

/** Format seconds into a human-readable expiry string (e.g., "5 min", "30 sec"). */
function _formatExpiry(expiresInSeconds: number): string {
  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) return "soon";
  if (expiresInSeconds < 90) return `${Math.ceil(expiresInSeconds)} sec`;
  const minutes = Math.ceil(expiresInSeconds / 60);
  return `${minutes} min`;
}

/**
 * Best-effort browser open. Uses platform-specific commands (open on macOS, xdg-open on Linux).
 * If it fails, the user still has the printed URL to copy-paste — this is just convenience.
 */
async function openBrowser(url: string): Promise<void> {
  try {
    const { execFile } = await import("node:child_process");
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    execFile(opener, [url], (_err) => {
      // Best-effort; user still has the printed URL.
    });
  } catch {
    // Best-effort; user still has the printed URL.
  }
}

/** Try to extract a human-readable error message from an API error response. */
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
  /**
   * xevol login
   *
   * Authenticates the CLI using the device code flow:
   *
   *   1. POST /auth/cli/device-code → get deviceCode + userCode + verificationUrl
   *   2. Open browser to verificationUrl?code=userCode
   *   3. Poll POST /auth/cli/device-token every N seconds with deviceCode
   *   4. When user approves in browser → receive CLI token
   *   5. Store token + account info in local config file
   *
   * Shortcut: if --token is provided (or XEVOL_TOKEN env var), skip the device
   * flow entirely and validate the token directly via /auth/session.
   */
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

        // Fast path: if a token is provided directly (--token or XEVOL_TOKEN),
        // skip the device flow and just validate it against the API.
        // This is useful for CI/CD, scripting, or re-authenticating with a known token.
        if (tokenOverride) {
          const { token, expired } = resolveToken(config, tokenOverride);
          if (!token) {
            console.error(
              expired
                ? "Token expired. Run `xevol login` to re-authenticate."
                : "Token required. Use --token <token> or set XEVOL_TOKEN.",
            );
            process.exitCode = 1;
            return;
          }

          // Validate the token by hitting /auth/session — this also gets us
          // the account info (email, etc.) to store in config
          const session = (await apiFetch("/auth/session", {
            token,
            apiUrl,
          })) as Record<string, unknown>;

          // Extract fields from session response — pickSessionField handles
          // the varying response shapes (data.email vs data.user.email etc.)
          const accountId = pickSessionField(session, "accountId");
          const email = pickSessionField(session, "email");
          const expiresAt = pickSessionField(session, "expiresAt");

          // Persist to config file (~/.xevol/config.json)
          // Merge with existing config — preserve fields not returned by session
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

          const _label = email ? `Logged in as ${chalk.bold(email)}` : "Logged in";
          return;
        }

        // === Device Code Flow (interactive login) ===

        // Step 1: Request a new device code from the API.
        // This creates the device flow in Redis with a 5-minute TTL.
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

        // Build the full verification URL with the code pre-filled,
        // so the user doesn't have to type it manually in the browser
        const verificationLink = new URL(verificationUrl);
        verificationLink.searchParams.set("code", userCode);

        // Try to open the browser automatically — best effort
        await openBrowser(verificationLink.toString());

        // Step 3: Poll /device-token until approved or expired.
        // Show a spinner so the user knows we're waiting.
        const spinner = startSpinner("Waiting for approval...");
        const expiresAt = Date.now() + expiresIn * 1000;
        const intervalMs = Math.max(1, interval) * 1000; // Min 1s to prevent tight loops
        const deviceTokenUrl = new URL("/auth/cli/device-token", apiUrl);

        try {
          while (Date.now() < expiresAt) {
            const pollResponse = await fetch(deviceTokenUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ deviceCode }),
            });

            // 202 = still pending, user hasn't approved yet
            if (pollResponse.status === 202) {
              await sleep(intervalMs);
              continue;
            }

            // 400 = expired or invalid — device code TTL elapsed
            if (pollResponse.status === 400) {
              const details = await readErrorMessage(pollResponse);
              spinner.fail("Device authorization expired.");
              console.error(details ?? "Device authorization expired. Run xevol login again.");
              process.exitCode = 1;
              return;
            }

            // 200 = approved! Response contains the minted CLI token.
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

              // Persist the token and account info to local config.
              // This is what `xevol whoami` and all other commands will use.
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

              const _label = email ? `Logged in as ${chalk.bold(email)}` : "Logged in";
              return;
            }

            // Any other status code = unexpected error
            const details = await readErrorMessage(pollResponse);
            spinner.fail("Authentication failed.");
            const message = details
              ? `API ${pollResponse.status}: ${details}`
              : `API ${pollResponse.status} ${pollResponse.statusText}`;
            throw new Error(message);
          }

          // Polling loop exited without approval — TTL expired
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

  /**
   * xevol logout
   *
   * Revokes the current CLI token server-side (POST /auth/cli/revoke)
   * and clears the local config file. The token is soft-deleted on the
   * server (revokedAt is set), so it can't be reused.
   */
  program
    .command("logout")
    .description("Revoke CLI token and clear local config")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const storedToken = config.token;
        const { token: resolvedToken, expired } = resolveToken(config, tokenOverride);
        // Prefer stored token over resolved — even if resolved is expired,
        // we still want to try revoking the stored token
        const token = storedToken ?? resolvedToken;

        if (!token) {
          return;
        }

        const apiUrl = resolveApiUrl(config);
        let response: unknown = { ok: true };

        try {
          // Best-effort server-side revocation — if it fails (network error,
          // server down), we still clear local config. The token will eventually
          // expire on its own (6-month TTL).
          response = await apiFetch("/auth/cli/revoke", { method: "POST", token, apiUrl });
        } catch (error) {
          response = { error: (error as Error).message };
        }

        // Always clear local config regardless of revocation success
        await clearConfig();

        if (options.json) {
          printJson(response);
          return;
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });

  /**
   * xevol whoami
   *
   * Shows the current authenticated account by calling /auth/session
   * with the stored CLI token. Quick way to verify auth is working.
   */
  program
    .command("whoami")
    .description("Show the current authenticated account")
    .option("--json", "Raw JSON output")
    .action(async (options, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options, command);
        const { token, expired } = resolveToken(config, tokenOverride);

        if (!token) {
          console.error(
            expired
              ? "Token expired. Run `xevol login` to re-authenticate."
              : "Not logged in. Use xevol login to authenticate.",
          );
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        // /auth/session with a Bearer token returns the user profile.
        // If the token is invalid/revoked/expired, apiFetch throws.
        const session = (await apiFetch("/auth/session", {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        if (options.json) {
          printJson(session);
          return;
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}

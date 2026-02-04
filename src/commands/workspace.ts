import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken, updateConfig } from "../lib/config";
import { printJson, renderTable, startSpinner } from "../lib/output";

interface WorkspaceListOptions {
  json?: boolean;
}

function normalizeWorkspaceResponse(data: Record<string, unknown>): Record<string, unknown>[] {
  return (
    (data.workspaces as Record<string, unknown>[] | undefined) ??
    (data.data as Record<string, unknown>[] | undefined) ??
    (data.list as Record<string, unknown>[] | undefined) ??
    (data.items as Record<string, unknown>[] | undefined) ??
    (data.results as Record<string, unknown>[] | undefined) ??
    []
  );
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function extractWorkspaceId(item: Record<string, unknown>): string | undefined {
  return (
    toStringValue(item.id) ?? toStringValue(item.workspaceId) ?? toStringValue(item._id) ?? toStringValue(item.slug)
  );
}

function extractWorkspaceName(item: Record<string, unknown>): string {
  return toStringValue(item.name) ?? toStringValue(item.title) ?? toStringValue(item.workspaceName) ?? "-";
}

function extractWorkspaceRole(item: Record<string, unknown>): string {
  return (
    toStringValue(item.role) ??
    toStringValue(item.userRole) ??
    toStringValue(item.memberRole) ??
    toStringValue(item.permission) ??
    "-"
  );
}

function formatBalanceValue(value: unknown): string | undefined {
  const direct = toStringValue(value);
  if (direct) return direct;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const amount =
      toStringValue(record.amount) ??
      toStringValue(record.balance) ??
      toStringValue(record.credits) ??
      toStringValue(record.remaining);
    if (amount) {
      const currency = toStringValue(record.currency);
      return currency ? `${amount} ${currency}` : amount;
    }
  }
  return undefined;
}

function extractWorkspaceBalance(item: Record<string, unknown>): string {
  return (
    formatBalanceValue(item.balance) ??
    formatBalanceValue(item.creditBalance) ??
    formatBalanceValue(item.credits) ??
    formatBalanceValue(item.remainingCredits) ??
    "-"
  );
}

function extractMemberCount(item: Record<string, unknown>): string {
  const candidates = [item.memberCount, item.membersCount, item.members, item.usersCount, item.userCount];

  for (const value of candidates) {
    if (Array.isArray(value)) return String(value.length);
    const asString = toStringValue(value);
    if (asString) return asString;
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const nested = toStringValue(record.count) ?? toStringValue(record.total) ?? toStringValue(record.members);
      if (nested) return nested;
    }
  }

  return "-";
}

export function registerWorkspaceCommand(program: Command): void {
  const workspace = program.command("workspace").description("Manage workspaces");

  workspace
    .command("list")
    .description("List available workspaces")
    .option("--json", "Raw JSON output")
    .action(async (options: WorkspaceListOptions, command) => {
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
        const spinner = startSpinner("Fetching workspaces...");
        const response = (await apiFetch("/v1/workspaces", {
          token,
          apiUrl,
        })) as Record<string, unknown>;
        spinner.stop();

        if (options.json) {
          printJson(response);
          return;
        }

        const items = normalizeWorkspaceResponse(response);
        const activeWorkspaceId = config.workspaceId;

        console.log("");
        console.log(`  ${chalk.bold("Workspaces")}  ${chalk.dim(`${items.length} total`)}`);
        console.log("");

        if (items.length === 0) {
          console.log("  No workspaces found.");
          console.log("");
          return;
        }

        const rows = items.map((item) => {
          const id = extractWorkspaceId(item) ?? "-";
          let name = extractWorkspaceName(item);
          if (activeWorkspaceId && id !== "-" && id === activeWorkspaceId) {
            name = `${name} (active)`;
          }
          const role = extractWorkspaceRole(item);
          const balance = extractWorkspaceBalance(item);
          const members = extractMemberCount(item);
          return [id, name, role, balance, members];
        });

        console.log(renderTable(["ID", "Name", "Role", "Balance", "Members"], rows));
        console.log("");
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });

  workspace
    .command("switch")
    .description("Switch active workspace")
    .argument("<id>", "Workspace ID")
    .action(async (id: string, options, command) => {
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
        const spinner = startSpinner("Validating workspace...");
        const response = (await apiFetch("/v1/workspaces", {
          token,
          apiUrl,
        })) as Record<string, unknown>;
        spinner.stop();

        const items = normalizeWorkspaceResponse(response);
        const workspaceMatch = items.find((item) => extractWorkspaceId(item) === id);

        if (!workspaceMatch) {
          console.error(chalk.red("Error:") + ` Workspace not found: ${id}`);
          process.exitCode = 1;
          return;
        }

        await updateConfig({ workspaceId: id });

        const displayName = extractWorkspaceName(workspaceMatch);
        const name = displayName === "-" ? "Unknown" : displayName;
        console.log(`Switched to workspace ${name} (${id})`);
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

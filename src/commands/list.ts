import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { formatDuration, formatStatus, printJson, renderTable } from "../lib/output";

interface ListOptions {
  page?: number;
  limit?: number;
  json?: boolean;
}

function getTokenOverride(options: { token?: string }, command: Command): string | undefined {
  if (options.token) return options.token;
  const globals = typeof command.optsWithGlobals === "function" ? command.optsWithGlobals() : command.parent?.opts() ?? {};
  return globals.token as string | undefined;
}

function normalizeListResponse(data: Record<string, unknown>) {
  const items =
    (data.data as Record<string, unknown>[] | undefined) ??
    (data.transcriptions as Record<string, unknown>[] | undefined) ??
    (data.items as Record<string, unknown>[] | undefined) ??
    (data.results as Record<string, unknown>[] | undefined) ??
    [];

  const pagination =
    (data.pagination as Record<string, unknown> | undefined) ??
    (data.meta as Record<string, unknown> | undefined) ??
    {};

  const page =
    (data.page as number | undefined) ??
    (pagination.page as number | undefined) ??
    1;
  const limit =
    (data.limit as number | undefined) ??
    (pagination.limit as number | undefined) ??
    items.length;
  const total =
    (data.total as number | undefined) ??
    (pagination.total as number | undefined) ??
    items.length;
  const totalPages =
    (data.totalPages as number | undefined) ??
    (pagination.totalPages as number | undefined) ??
    (limit ? Math.ceil(total / limit) : 1);

  return { items, page, limit, total, totalPages };
}

function pickValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
  }
  return "—";
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List transcriptions")
    .option("--page <number>", "Page number", (value) => Number.parseInt(value, 10), 1)
    .option("--limit <number>", "Items per page", (value) => Number.parseInt(value, 10), 20)
    .option("--json", "Raw JSON output")
    .action(async (options: ListOptions, command) => {
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
        const response = (await apiFetch("/v1/transcription/transcriptions", {
          query: { page: options.page, limit: options.limit },
          token,
          apiUrl,
        })) as Record<string, unknown>;

        if (options.json) {
          printJson(response);
          return;
        }

        const { items, page, total, totalPages } = normalizeListResponse(response);

        console.log(chalk.bold(`Transcriptions (page ${page}/${totalPages}, ${total} total)`));
        console.log("");

        const rows = items.map((item) => {
          const id = pickValue(item, ["id", "transcriptionId", "_id"]);
          const status = formatStatus(pickValue(item, ["status", "state"]));
          const lang = pickValue(item, ["lang", "outputLang", "language"]);
          const durationRaw =
            (item.duration as number | string | undefined) ??
            (item.durationSec as number | undefined) ??
            (item.durationSeconds as number | undefined) ??
            (item.lengthSec as number | undefined);
          const duration = formatDuration(durationRaw ?? "—");
          const channel = pickValue(item, ["channel", "channelTitle", "author", "uploader"]);
          const title = pickValue(item, ["title", "videoTitle", "name"]);

          return [id, status, lang, duration, channel, title];
        });

        if (rows.length === 0) {
          console.log("No transcriptions found.");
          return;
        }

        console.log(renderTable(["ID", "Status", "Lang", "Duration", "Channel", "Title"], rows));

        if (totalPages > 1 && page < totalPages) {
          console.log("");
          console.log(`Page ${page} of ${totalPages} — use --page ${page + 1} for next`);
        }
      } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
      }
    });
}

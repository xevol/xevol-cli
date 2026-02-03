import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { formatDuration, formatDurationCompact, printJson, renderCards, type CardItem } from "../lib/output";
import { pickValueOrDash } from "../lib/utils";

function formatCreatedAt(raw: string | undefined): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show compact date for older items
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    if (d.getFullYear() === now.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${d.getFullYear()}-${month}-${day}`;
  } catch {
    return "—";
  }
}

interface ListOptions {
  page?: number;
  limit?: number;
  json?: boolean;
  csv?: boolean;
  status?: string;
  sort?: string;
  search?: string;
}

function normalizeListResponse(data: Record<string, unknown>) {
  const items =
    (data.list as Record<string, unknown>[] | undefined) ??
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

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List transcriptions")
    .option("--page <number>", "Page number", (value) => Number.parseInt(value, 10), 1)
    .option("--limit <number>", "Items per page", (value) => Number.parseInt(value, 10), 20)
    .option("--json", "Raw JSON output")
    .option("--csv", "CSV output")
    .option("--status <status>", "Filter by status (complete, pending, error)")
    .option("--sort <field>", "Sort field (e.g. createdAt:desc, title:asc)")
    .option("--search <query>", "Search by title")
    .addHelpText('after', `
Examples:
  $ xevol list
  $ xevol list --limit 5 --page 2
  $ xevol list --status complete --csv
  $ xevol list --search "react tutorial"
  $ xevol list --json`)
    .action(async (options: ListOptions, command) => {
      try {
        const config = (await readConfig()) ?? {};
        const tokenOverride = getTokenOverride(options as { token?: string }, command);
        const { token, expired } = resolveToken(config, tokenOverride);

        if (!token) {
          console.error(expired ? "Token expired. Run `xevol login` to re-authenticate." : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const response = (await apiFetch("/v1/transcriptions", {
          query: { page: options.page, limit: options.limit, status: options.status, sort: options.sort, q: options.search },
          token,
          apiUrl,
        })) as Record<string, unknown>;

        if (options.json) {
          printJson(response);
          return;
        }

        const { items, page, total, totalPages } = normalizeListResponse(response);

        if (options.csv) {
          const csvQuote = (v: string) => {
            const sanitized = v.replace(/\n/g, ' ');
            return sanitized.includes(',') || sanitized.includes('"')
              ? `"${sanitized.replace(/"/g, '""')}"`
              : sanitized;
          };
          console.log("ID,Status,Lang,Duration,Channel,Title,Created");
          for (const item of items) {
            const id = pickValueOrDash(item, ["id", "transcriptionId", "_id"]);
            const status = pickValueOrDash(item, ["status", "state"]);
            const lang = pickValueOrDash(item, ["lang", "outputLang", "language"]);
            const durationRaw =
              (item.duration as number | string | undefined) ??
              (item.durationSec as number | undefined) ??
              (item.durationSeconds as number | undefined) ??
              (item.lengthSec as number | undefined);
            const duration = formatDuration(durationRaw ?? "—");
            const channel = pickValueOrDash(item, ["channel", "channelTitle", "author", "uploader"]);
            const title = pickValueOrDash(item, ["title", "videoTitle", "name"]);
            const created = formatCreatedAt(item.createdAt as string | undefined);
            console.log([id, status, lang, duration, channel, title, created].map(csvQuote).join(","));
          }
          return;
        }

        // Header
        console.log("");
        console.log(`  ${chalk.bold("Transcriptions")}  ${chalk.dim(`${total} total · page ${page}/${totalPages}`)}`);
        console.log("");

        const cards: CardItem[] = items.map((item) => {
          const id = pickValueOrDash(item, ["id", "transcriptionId", "_id"]);
          const status = pickValueOrDash(item, ["status", "state"]);
          const durationRaw =
            (item.duration as number | string | undefined) ??
            (item.durationSec as number | undefined) ??
            (item.durationSeconds as number | undefined) ??
            (item.lengthSec as number | undefined);
          const duration = formatDurationCompact(durationRaw ?? "—");
          const channel = pickValueOrDash(item, ["channel", "channelTitle", "author", "uploader"]);
          const title = pickValueOrDash(item, ["title", "videoTitle", "name"]);
          const created = formatCreatedAt(item.createdAt as string | undefined);

          return { title, channel, duration, status, id, created };
        });

        if (cards.length === 0) {
          console.log("  No transcriptions found.");
          return;
        }

        const startIndex = ((page - 1) * (options.limit ?? 20)) + 1;
        console.log(renderCards(cards, { startIndex }));

        if (totalPages > 1 && page < totalPages) {
          console.log("");
          console.log(chalk.dim(`  Page ${page} of ${totalPages} — use --page ${page + 1} for next`));
        }
        console.log("");
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

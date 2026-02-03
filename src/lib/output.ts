import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function formatDuration(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";

  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const paddedSeconds = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
}

export function formatStatus(status?: string | null): string {
  if (!status) return "—";
  const normalized = status.toLowerCase();
  if (normalized.includes("complete")) return chalk.green(status);
  if (normalized.includes("pending") || normalized.includes("processing")) return chalk.yellow(status);
  if (normalized.includes("error") || normalized.includes("failed")) return chalk.red(status);
  return status;
}

export function formatDurationCompact(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";

  // If it's already a string like "00:04:02", strip leading zero groups
  if (typeof value === "string") {
    // Strip leading "00:" segments, then strip leading zero from first group
    let d = value.replace(/^00:/, "");
    // Remove leading zero from remaining first segment (04:02 -> 4:02)
    d = d.replace(/^0(\d)/, "$1");
    return d;
  }

  if (!Number.isFinite(value)) return "—";
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const paddedSeconds = String(seconds).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/** Strip ANSI escape codes for measuring visible string width */
function stripAnsi(str: string): string {
  // biome-ignore lint: ansi regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
}

export interface CardItem {
  title: string;
  channel: string;
  duration: string;
  status: string;
  id: string;
  created: string;
}

export function renderCards(items: CardItem[], opts: { startIndex: number }): string {
  const termWidth = process.stdout.columns || 80;
  const lines: string[] = [];
  const rowNumWidth = String(opts.startIndex + items.length).length;
  const padding = 2; // left indent
  const gap = 2; // gap between title and timestamp

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const num = String(opts.startIndex + i).padStart(rowNumWidth, " ");
    const prefix = " ".repeat(padding);
    const metaPrefix = " ".repeat(padding + rowNumWidth + 2);

    // Line 1: num  Title ...right-align... created
    const createdStr = item.created;
    const createdWidth = createdStr.length;
    const titleMaxWidth = termWidth - padding - rowNumWidth - 2 - gap - createdWidth;

    let titleDisplay = item.title;
    if (titleDisplay.length > titleMaxWidth) {
      titleDisplay = titleDisplay.slice(0, Math.max(0, titleMaxWidth - 1)) + "…";
    }

    const titlePadded = titleDisplay.length < titleMaxWidth
      ? titleDisplay + " ".repeat(titleMaxWidth - titleDisplay.length)
      : titleDisplay;

    const line1 = `${prefix}${chalk.dim(num)}  ${chalk.bold.white(titlePadded)}  ${chalk.dim(createdStr)}`;

    // Line 2: metadata left, ID right
    const metaParts: string[] = [];
    if (item.channel && item.channel !== "—") metaParts.push(item.channel);
    if (item.duration && item.duration !== "—") metaParts.push(item.duration);

    // Only show status if NOT complete
    const statusNorm = item.status.toLowerCase();
    if (statusNorm && statusNorm !== "complete" && statusNorm !== "completed") {
      if (statusNorm.includes("pending") || statusNorm.includes("processing")) {
        metaParts.push(chalk.yellow(item.status));
      } else if (statusNorm.includes("error") || statusNorm.includes("failed")) {
        metaParts.push(chalk.red(item.status));
      } else {
        metaParts.push(item.status);
      }
    }

    const metaStr = chalk.dim(metaParts.filter(Boolean).join(" · "));
    const idStr = chalk.dim(item.id);
    const metaVisLen = stripAnsi(metaStr).length;
    const idVisLen = stripAnsi(idStr).length;
    const metaPrefixLen = metaPrefix.length;
    const spaceBetween = Math.max(1, termWidth - metaPrefixLen - metaVisLen - idVisLen);

    const line2 = `${metaPrefix}${metaStr}${" ".repeat(spaceBetween)}${idStr}`;

    lines.push(line1);
    lines.push(line2);
    if (i < items.length - 1) lines.push(""); // blank line between cards
  }

  return lines.join("\n");
}

export function renderTable(headers: string[], rows: string[][]): string {
  const table = new Table({
    head: headers,
    style: { head: ["cyan"], border: ["gray"] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}

export function divider(width?: number): string {
  const fallbackWidth = 40;
  const maxWidth = Math.min(width ?? process.stdout.columns ?? fallbackWidth, 100);
  const size = Math.max(20, maxWidth);
  return "─".repeat(size);
}

export function startSpinner(text: string) {
  if (!process.stdout.isTTY) {
    // When piped, write progress to stderr instead
    process.stderr.write(`${text}\n`);
    return {
      text,
      succeed(msg?: string) { if (msg) process.stderr.write(`✔ ${msg}\n`); },
      fail(msg?: string) { if (msg) process.stderr.write(`✖ ${msg}\n`); },
      stop() {},
      start() { return this; },
    } as ReturnType<typeof ora>;
  }
  return ora({ text, spinner: "dots" }).start();
}

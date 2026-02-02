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
  return ora({ text, spinner: "dots" }).start();
}

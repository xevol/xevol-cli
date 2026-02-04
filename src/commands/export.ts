import chalk from "chalk";
import type { Command } from "commander";
import { promises as fs } from "fs";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { printJson, startSpinner } from "../lib/output";
import { pickValue } from "../lib/utils";

interface ExportOptions {
  format?: string;
  output?: string;
  json?: boolean;
}

function buildMarkdown(data: Record<string, unknown>): string {
  const title = pickValue(data, ["title", "videoTitle", "name"]) ?? "Untitled";
  const channel = pickValue(data, ["channel", "channelTitle", "author"]) ?? "";
  const url = pickValue(data, ["url", "youtubeUrl", "videoUrl"]) ?? "";
  const lang = pickValue(data, ["lang", "outputLang", "language"]) ?? "";
  const status = pickValue(data, ["status", "state"]) ?? "";
  const content =
    (data.cleanContent as string | undefined) ??
    (data.content as string | undefined) ??
    (data.transcript as string | undefined) ??
    "";

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  const meta: string[] = [];
  if (channel) meta.push(`- **Channel:** ${channel}`);
  if (url) meta.push(`- **URL:** ${url}`);
  if (lang) meta.push(`- **Language:** ${lang}`);
  if (status) meta.push(`- **Status:** ${status}`);
  if (meta.length > 0) {
    lines.push(...meta);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  if (content) {
    lines.push(content);
  } else {
    lines.push("*No transcript content available.*");
  }

  return lines.join("\n");
}

function buildText(data: Record<string, unknown>): string {
  return (
    (data.cleanContent as string | undefined) ??
    (data.content as string | undefined) ??
    (data.transcript as string | undefined) ??
    ""
  );
}

export function registerExportCommand(program: Command): void {
  program
    .command("export")
    .description("Export a transcription as JSON, markdown, or text")
    .argument("<id>", "Transcription ID")
    .option("--format <fmt>", "Output format: json, markdown, text", "json")
    .option("--output <file>", "Write to file instead of stdout")
    .option("--json", "Shorthand for --format json")
    .addHelpText(
      "after",
      `
Examples:
  $ xevol export abc123
  $ xevol export abc123 --format markdown
  $ xevol export abc123 --format text --output transcript.txt
  $ xevol export abc123 --json > data.json`,
    )
    .action(async (id: string, options: ExportOptions, command) => {
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

        const format = options.json ? "json" : (options.format ?? "json");
        if (!["json", "markdown", "text"].includes(format)) {
          console.error(`Invalid format "${format}". Use: json, markdown, text`);
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const spinner = options.output ? startSpinner("Fetching transcription…") : null;

        const response = (await apiFetch(`/v1/analysis/${id}`, {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        // Unwrap nested data
        const data =
          (response.analysis as Record<string, unknown> | undefined) ??
          (response.data as Record<string, unknown> | undefined) ??
          response;

        spinner?.stop();

        let output: string;
        if (format === "json") {
          output = JSON.stringify(data, null, 2);
        } else if (format === "markdown") {
          output = buildMarkdown(data);
        } else {
          output = buildText(data);
        }

        if (!output.trim()) {
          console.error(chalk.yellow("No content available for this transcription."));
          process.exitCode = 1;
          return;
        }

        if (options.output) {
          await fs.writeFile(options.output, output, "utf-8");
          console.error(chalk.green("✓") + ` Written to ${options.output}`);
        } else {
          process.stdout.write(output);
          // Ensure trailing newline for terminal
          if (!output.endsWith("\n")) {
            process.stdout.write("\n");
          }
        }
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

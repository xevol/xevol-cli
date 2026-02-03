import chalk from "chalk";
import type { Command } from "commander";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { formatDuration, printJson } from "../lib/output";
import { pickValue } from "../lib/utils";
import { buildMarkdownFromAnalysis } from "../tui/utils/markdown";

interface ViewOptions {
  raw?: boolean;
  clean?: boolean;
  json?: boolean;
  md?: boolean;
}

function getAnalysisPayload(response: Record<string, unknown>): Record<string, unknown> {
  if (response.analysis && typeof response.analysis === "object") {
    return response.analysis as Record<string, unknown>;
  }
  if (response.data && typeof response.data === "object") {
    return response.data as Record<string, unknown>;
  }
  return response;
}

export function registerViewCommand(program: Command): void {
  program
    .command("view")
    .description("View a transcription")
    .argument("<id>", "Transcription ID")
    .option("--raw", "Print the full transcript")
    .option("--clean", "Use cleanContent instead of content")
    .option("--json", "Raw JSON output")
    .option("--md", "Output as markdown (pipe-friendly)")
    .action(async (id: string, options: ViewOptions, command) => {
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

        if (options.clean && !options.raw) {
          console.error("--clean can only be used with --raw.");
          process.exitCode = 1;
          return;
        }

        const apiUrl = resolveApiUrl(config);
        const response = (await apiFetch(`/v1/analysis/${id}`, {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        if (options.json) {
          printJson(response);
          return;
        }

        const data = getAnalysisPayload(response);

        if (options.md) {
          const md = buildMarkdownFromAnalysis(data);
          if (md.trim()) {
            process.stdout.write(md);
          } else {
            console.error("No content available for markdown export.");
            process.exitCode = 1;
          }
          return;
        }
        const _title = pickValue(data, ["title", "videoTitle", "name"]) ?? "Untitled";
        const channel = pickValue(data, ["channel", "channelTitle", "author"]) ?? "Unknown";
        const channelHandle = pickValue(data, ["channelHandle", "handle", "channelTag"]);
        const _duration = formatDuration(
          (data.duration as number | string | undefined) ??
            (data.durationSec as number | undefined) ??
            (data.durationSeconds as number | undefined),
        );
        const _lang = pickValue(data, ["lang", "outputLang", "language"]) ?? "—";
        const _status = pickValue(data, ["status", "state"]) ?? "—";
        const url = pickValue(data, ["url", "youtubeUrl", "videoUrl"]);

        if (options.raw) {
          const contentKey = options.clean ? "cleanContent" : "content";
          const content = data[contentKey] as string | undefined;
          if (!content) {
            console.error("No transcript content available.");
            process.exitCode = 1;
            return;
          }
          return;
        }

        const _channelLabel = channelHandle
          ? `${channel} (${channelHandle.startsWith("@") ? channelHandle : `@${channelHandle}`})`
          : channel;
        if (url) {
        }

        const summary =
          (data.summary as string | undefined) ??
          (data.overview as string | undefined) ??
          (data.analysis as Record<string, unknown> | undefined)?.summary?.toString();

        if (summary) {
        } else {
        }
      } catch (error) {
        console.error(`${chalk.red("Error:")} ${(error as Error).message}`);
        process.exitCode = 1;
      }
    });
}

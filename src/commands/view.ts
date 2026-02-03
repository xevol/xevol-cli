import { Command } from "commander";
import chalk from "chalk";
import { apiFetch } from "../lib/api";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { divider, formatDuration, printJson } from "../lib/output";
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
          console.error(expired ? "Token expired. Run `xevol login` to re-authenticate." : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.");
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
        const title = pickValue(data, ["title", "videoTitle", "name"]) ?? "Untitled";
        const channel = pickValue(data, ["channel", "channelTitle", "author"]) ?? "Unknown";
        const channelHandle = pickValue(data, ["channelHandle", "handle", "channelTag"]);
        const duration = formatDuration(
          (data.duration as number | string | undefined) ??
            (data.durationSec as number | undefined) ??
            (data.durationSeconds as number | undefined),
        );
        const lang = pickValue(data, ["lang", "outputLang", "language"]) ?? "—";
        const status = pickValue(data, ["status", "state"]) ?? "—";
        const url = pickValue(data, ["url", "youtubeUrl", "videoUrl"]);

        if (options.raw) {
          const contentKey = options.clean ? "cleanContent" : "content";
          const content = data[contentKey] as string | undefined;
          if (!content) {
            console.error("No transcript content available.");
            process.exitCode = 1;
            return;
          }
          console.log(content);
          return;
        }

        const channelLabel = channelHandle
          ? `${channel} (${channelHandle.startsWith("@") ? channelHandle : `@${channelHandle}`})`
          : channel;

        console.log(chalk.bold(title));
        console.log(`Channel: ${channelLabel}`);
        console.log(`Duration: ${duration} | Lang: ${lang} | Status: ${status}`);
        if (url) {
          console.log(`URL: ${url}`);
        }
        console.log(divider());

        const summary =
          (data.summary as string | undefined) ??
          (data.overview as string | undefined) ??
          (data.analysis as Record<string, unknown> | undefined)?.summary?.toString();

        if (summary) {
          console.log(summary);
        } else {
          console.log("No summary available.");
        }

        console.log(divider());
        console.log("Full transcript: use --raw");
      } catch (error) {
        console.error(chalk.red("Error:") + " " + (error as Error).message);
        process.exitCode = 1;
      }
    });
}

import { Command } from "commander";
import chalk from "chalk";
import { getTokenOverride, readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { printJson } from "../lib/output";
import { streamSSE, type SSEEvent } from "../lib/sse";

/** Default SSE idle timeout in ms */
const SSE_IDLE_TIMEOUT_MS = 30_000;

interface StreamOptions {
  json?: boolean;
  lastEventId?: string;
}

/**
 * Stream a spike's content to the terminal via SSE.
 * Returns the last event ID for resume support.
 */
export async function streamSpikeToTerminal(
  spikeId: string,
  token: string,
  apiUrl: string,
  options: { json?: boolean; lastEventId?: string; header?: string } = {},
): Promise<{ lastEventId?: string; content: string }> {
  if (options.header) {
    console.log(chalk.bold.cyan(`\n─── ${options.header} ───`));
  }

  let lastEventId: string | undefined = options.lastEventId;
  let fullContent = "";

  // SSE idle timeout: abort if no events received for 30s
  const controller = new AbortController();
  let idleTimer = setTimeout(() => controller.abort(), SSE_IDLE_TIMEOUT_MS);
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), SSE_IDLE_TIMEOUT_MS);
  };

  const stream = streamSSE(`/spikes/stream/${spikeId}`, {
    token,
    apiUrl,
    lastEventId: options.lastEventId,
    signal: controller.signal,
  });

  try {
  for await (const event of stream) {
    resetIdleTimer();
    if (event.id) {
      lastEventId = event.id;
    }

    if (options.json) {
      printJson(event);
      continue;
    }

    // Handle "complete" event (spike was already done, returned as JSON)
    if (event.event === "complete") {
      try {
        const parsed = JSON.parse(event.data) as {
          status?: string;
          data?: string;
          content?: string;
          markdown?: string;
        };
        const content = parsed.data ?? parsed.content ?? parsed.markdown ?? "";
        fullContent += content;
        process.stdout.write(content);
      } catch {
        fullContent += event.data;
        process.stdout.write(event.data);
      }
      continue;
    }

    // Handle streaming chunk events
    if (event.event === "chunk" || event.event === "delta" || !event.event) {
      // Try to parse data as JSON (some APIs wrap chunks)
      try {
        const parsed = JSON.parse(event.data) as { text?: string; content?: string; chunk?: string; delta?: string };
        const text = parsed.text ?? parsed.content ?? parsed.chunk ?? parsed.delta ?? event.data;
        fullContent += text;
        process.stdout.write(text);
      } catch {
        // Plain text data
        fullContent += event.data;
        process.stdout.write(event.data);
      }
      continue;
    }

    // Handle done/end events
    if (event.event === "done" || event.event === "end") {
      // Some APIs send a final event with the complete content
      if (event.data && event.data !== "[DONE]") {
        try {
          const parsed = JSON.parse(event.data) as { content?: string; text?: string };
          const text = parsed.content ?? parsed.text;
          if (text && !fullContent) {
            fullContent = text;
            process.stdout.write(text);
          }
        } catch {
          // ignore
        }
      }
      continue;
    }

    // Handle error events
    if (event.event === "error") {
      console.error(chalk.red(`\nStream error: ${event.data}`));
      continue;
    }
  }

  // Ensure newline after streaming content
  if (fullContent && !fullContent.endsWith("\n")) {
    process.stdout.write("\n");
  }
  } finally {
    clearTimeout(idleTimer);
  }

  return { lastEventId, content: fullContent };
}

export function registerStreamCommand(program: Command): void {
  program
    .command("stream")
    .description("Stream analysis content in real-time via SSE")
    .argument("<spikeId>", "Analysis ID to stream")
    .option("--json", "Output raw SSE events as JSON")
    .option("--last-event-id <id>", "Resume from a specific event ID")
    .addHelpText('after', `
Examples:
  $ xevol stream abc123
  $ xevol stream abc123 --json
  $ xevol stream abc123 --last-event-id 42`)
    .action(async (spikeId: string, options: StreamOptions, command) => {
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

        const result = await streamSpikeToTerminal(spikeId, token, apiUrl, {
          json: options.json,
          lastEventId: options.lastEventId,
        });

        if (!options.json && result.content) {
          console.log(chalk.green("\n✔ Stream complete"));
        }
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        process.exitCode = 1;
      }
    });
}

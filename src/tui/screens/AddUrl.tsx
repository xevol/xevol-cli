import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { streamSSE, type SSEEvent } from "../../lib/sse";
import { extractId, extractStatus, pickValue } from "../../lib/utils";
import { wrapText } from "../utils/wrapText";
import type { Hint } from "../components/Footer";

interface TerminalSize {
  columns: number;
  rows: number;
}

interface AddUrlProps {
  onBack: () => void;
  terminal: TerminalSize;
  setFooterHints: (hints: Hint[]) => void;
}

type Phase = "input" | "submitting" | "processing" | "creating-spike" | "streaming" | "done" | "error";

const YOUTUBE_URL_RE = /^https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch|shorts|live|embed)|youtu\.be\/)/i;

function extractChunk(event: SSEEvent): string | null {
  if (event.event === "complete") {
    try {
      const parsed = JSON.parse(event.data) as { data?: string; content?: string; markdown?: string };
      return parsed.data ?? parsed.content ?? parsed.markdown ?? "";
    } catch {
      return event.data;
    }
  }

  if (event.event === "chunk" || event.event === "delta" || !event.event) {
    try {
      const parsed = JSON.parse(event.data) as { text?: string; content?: string; chunk?: string; delta?: string };
      return parsed.text ?? parsed.content ?? parsed.chunk ?? parsed.delta ?? event.data;
    } catch {
      return event.data;
    }
  }

  if (event.event === "done" || event.event === "end") {
    if (!event.data || event.data === "[DONE]") return null;
    try {
      const parsed = JSON.parse(event.data) as { content?: string; text?: string };
      return parsed.content ?? parsed.text ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

export function AddUrl({ onBack, terminal, setFooterHints }: AddUrlProps): JSX.Element {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [transcriptionTitle, setTranscriptionTitle] = useState("");

  // Update footer hints based on phase
  useEffect(() => {
    if (phase === "input") {
      setFooterHints([
        { key: "Enter", description: "submit" },
        { key: "Esc", description: "cancel" },
      ]);
    } else if (phase === "done") {
      setFooterHints([
        { key: "↑/↓", description: "scroll" },
        { key: "Esc", description: "back" },
      ]);
    } else if (phase === "error") {
      setFooterHints([
        { key: "r", description: "retry" },
        { key: "Esc", description: "back" },
      ]);
    } else if (phase === "streaming") {
      setFooterHints([
        { key: "↑/↓", description: "scroll" },
        { key: "Esc", description: "back" },
      ]);
    } else {
      setFooterHints([
        { key: "", description: "Processing…" },
      ]);
    }
  }, [phase, setFooterHints]);

  const contentWidth = Math.max(20, terminal.columns - 4);
  const contentLines = wrapText(streamContent || " ", contentWidth);
  const reservedRows = 10;
  const contentHeight = Math.max(4, terminal.rows - reservedRows);
  const maxOffset = Math.max(0, contentLines.length - contentHeight);

  // Auto-scroll during streaming
  useEffect(() => {
    if (phase === "streaming") {
      setScrollOffset(maxOffset);
    }
  }, [maxOffset, phase]);

  const runPipeline = useCallback(async (youtubeUrl: string) => {
    try {
      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        setErrorText(
          expired
            ? "Token expired. Run `xevol login` to re-authenticate."
            : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
        );
        setPhase("error");
        return;
      }
      const apiUrl = resolveApiUrl(config);

      // 1. Submit URL
      setPhase("submitting");
      setStatusText("Submitting URL…");

      const addResponse = (await apiFetch("/v1/add", {
        query: { url: youtubeUrl, outputLang: "en" },
        token,
        apiUrl,
      })) as Record<string, unknown>;

      const transcriptionId = extractId(addResponse);
      if (!transcriptionId) {
        setErrorText("No transcription ID returned from API.");
        setPhase("error");
        return;
      }

      // 2. Poll for completion
      setPhase("processing");
      const maxAttempts = 120;
      let finalResponse: Record<string, unknown> | null = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const statusResponse = (await apiFetch(`/v1/status/${transcriptionId}`, {
          token,
          apiUrl,
        })) as Record<string, unknown>;

        const currentStatus = extractStatus(statusResponse)?.toLowerCase() ?? "pending";
        const elapsed = attempt * 5;
        setStatusText(`Processing… (${elapsed}s)`);

        if (currentStatus.includes("complete")) {
          const titleVal = pickValue(statusResponse, ["title", "videoTitle", "name"]);
          if (titleVal) setTranscriptionTitle(titleVal);
          finalResponse = statusResponse;
          break;
        }

        if (currentStatus.includes("error") || currentStatus.includes("failed")) {
          setErrorText(`Transcription failed: ${currentStatus}`);
          setPhase("error");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      if (!finalResponse) {
        setErrorText("Timed out waiting for transcription to complete.");
        setPhase("error");
        return;
      }

      // 3. Create spike
      setPhase("creating-spike");
      setStatusText("Creating spike…");

      const spikeResponse = (await apiFetch(`/spikes/${transcriptionId}`, {
        method: "POST",
        body: { promptId: "formatted", outputLang: "en" },
        token,
        apiUrl,
      })) as Record<string, unknown>;

      const spikeId = spikeResponse.spikeId as string | undefined;

      // Check for cached content
      const cachedContent =
        (spikeResponse.content as string) ??
        (spikeResponse.markdown as string);
      if (cachedContent) {
        setStreamContent(cachedContent);
        setPhase("done");
        return;
      }

      if (!spikeId) {
        setErrorText("No spike ID returned — spike may not have been created.");
        setPhase("error");
        return;
      }

      // 4. Stream spike content
      setPhase("streaming");
      setStatusText("Streaming content…");

      const controller = new AbortController();
      let fullContent = "";

      const streamPaths = [`/stream/spikes/${spikeId}`, `/spikes/stream/${spikeId}`];
      let streamed = false;
      let lastError: Error | null = null;

      for (const spath of streamPaths) {
        try {
          for await (const event of streamSSE(spath, {
            token,
            apiUrl,
            signal: controller.signal,
          })) {
            if (event.event === "error") {
              continue;
            }
            const chunk = extractChunk(event);
            if (chunk) {
              fullContent += chunk;
              setStreamContent(fullContent);
            }
          }
          streamed = true;
          break;
        } catch (err) {
          lastError = err as Error;
        }
      }

      if (!streamed && lastError) {
        // If streaming failed but we got some content, show it
        if (fullContent) {
          setPhase("done");
        } else {
          setErrorText(lastError.message);
          setPhase("error");
        }
        return;
      }

      setPhase("done");
    } catch (err) {
      setErrorText((err as Error).message);
      setPhase("error");
    }
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (!YOUTUBE_URL_RE.test(trimmed)) {
        setErrorText("Not a valid YouTube URL.");
        setPhase("error");
        return;
      }
      void runPipeline(trimmed);
    },
    [runPipeline],
  );

  useInput((input, key) => {
    if (phase === "input") {
      if (key.escape) {
        onBack();
        return;
      }
      // TextInput handles the rest
      return;
    }

    if (phase === "error") {
      if (key.escape || key.backspace) {
        onBack();
        return;
      }
      if (input.toLowerCase() === "r") {
        setErrorText("");
        setPhase("input");
        return;
      }
      return;
    }

    if (phase === "done" || phase === "streaming") {
      if (key.escape || key.backspace) {
        onBack();
        return;
      }
      if (key.upArrow || input.toLowerCase() === "k") {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input.toLowerCase() === "j") {
        setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
        return;
      }
    }
  });

  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + contentHeight);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={colors.primary}>Add YouTube URL</Text>

      {phase === "input" && (
        <Box marginTop={1} flexDirection="row">
          <Text color={colors.secondary}>URL: </Text>
          <TextInput
            value={url}
            onChange={setUrl}
            onSubmit={handleSubmit}
            placeholder="https://youtube.com/watch?v=..."
          />
        </Box>
      )}

      {(phase === "submitting" || phase === "processing" || phase === "creating-spike") && (
        <Box marginTop={1}>
          <Spinner label={statusText} />
        </Box>
      )}

      {phase === "streaming" && (
        <Box flexDirection="column" marginTop={1}>
          {transcriptionTitle && (
            <Text color={colors.secondary}>{transcriptionTitle}</Text>
          )}
          <Box marginTop={1}>
            <Spinner label="Streaming…" />
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text>{visibleLines.join("\n")}</Text>
          </Box>
        </Box>
      )}

      {phase === "done" && (
        <Box flexDirection="column" marginTop={1}>
          {transcriptionTitle && (
            <Text color={colors.secondary}>{transcriptionTitle}</Text>
          )}
          <Box marginTop={1}>
            <Text color={colors.success}>✔ Complete</Text>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text>{visibleLines.join("\n")}</Text>
          </Box>
        </Box>
      )}

      {phase === "error" && (
        <Box marginTop={1} flexDirection="column">
          <Text color={colors.error}>Error: {errorText}</Text>
          <Box marginTop={1}>
            <Text color={colors.secondary}>Press r to retry, Esc to go back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

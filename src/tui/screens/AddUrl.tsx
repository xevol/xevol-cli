import { Box, Text, useInput } from "ink";
import InkSpinner from "ink-spinner";
import TextInput from "ink-text-input";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { parseResponse } from "../../lib/parseResponse";
import { AddResponseSchema, SpikeCreateResponseSchema } from "../../lib/schemas";
import { type SSEEvent, streamSSE } from "../../lib/sse";
import { extractId, extractStatus, pickValue } from "../../lib/utils";
import { Spinner } from "../components/Spinner";
import { useInputLock } from "../context/InputContext";
import { useLayout } from "../context/LayoutContext";
import { colors } from "../theme";
import { copyToClipboard } from "../utils/clipboard";
import { parseMarkdownStructure, renderMarkdownWindow } from "../utils/renderMarkdown";
import { wrapText } from "../utils/wrapText";

interface TerminalSize {
  columns: number;
  rows: number;
}

interface AddUrlProps {
  onBack: () => void;
  terminal: TerminalSize;
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

interface PhaseTimer {
  startedAt: number;
  elapsed: number;
  done: boolean;
}

const PHASE_ORDER: Phase[] = ["submitting", "processing", "creating-spike", "streaming"];
const PHASE_LABELS: Record<string, string> = {
  submitting: "Submitting",
  processing: "Transcribing",
  "creating-spike": "Analyzing",
  streaming: "Streaming",
  done: "Done",
};

export function AddUrl({ onBack, terminal }: AddUrlProps): JSX.Element {
  const { setFooterHints } = useLayout();
  const { setInputActive } = useInputLock();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [streamContent, setStreamContent] = useState("");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [transcriptionTitle, setTranscriptionTitle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [transcriptionId, setTranscriptionId] = useState<string | null>(null);
  const [phaseTimers, setPhaseTimers] = useState<Record<string, PhaseTimer>>({});
  const abortControllerRef = React.useRef<AbortController | null>(null);
  const phaseTimerInterval = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Track phase transitions with elapsed time
  const startPhaseTimer = useCallback((phaseName: string) => {
    setPhaseTimers((prev) => {
      // Mark all previous phases as done
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (!updated[key].done) {
          updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt, done: true };
        }
      }
      updated[phaseName] = { startedAt: Date.now(), elapsed: 0, done: false };
      return updated;
    });
  }, []);

  const finishAllTimers = useCallback(() => {
    setPhaseTimers((prev) => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (!updated[key].done) {
          updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt, done: true };
        }
      }
      return updated;
    });
  }, []);

  // Tick active timer every second
  useEffect(() => {
    if (phase === "input" || phase === "done" || phase === "error") {
      if (phaseTimerInterval.current) {
        clearInterval(phaseTimerInterval.current);
        phaseTimerInterval.current = null;
      }
      return;
    }
    phaseTimerInterval.current = setInterval(() => {
      setPhaseTimers((prev) => {
        const updated = { ...prev };
        for (const key of Object.keys(updated)) {
          if (!updated[key].done) {
            updated[key] = { ...updated[key], elapsed: Date.now() - updated[key].startedAt };
          }
        }
        return updated;
      });
    }, 1000);
    return () => {
      if (phaseTimerInterval.current) {
        clearInterval(phaseTimerInterval.current);
        phaseTimerInterval.current = null;
      }
    };
  }, [phase]);

  // Lock global input when in text input phase
  useEffect(() => {
    setInputActive(phase === "input");
    return () => setInputActive(false);
  }, [phase, setInputActive]);

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
        { key: "y", description: "copy" },
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
        { key: "y", description: "copy" },
        { key: "Esc", description: "back" },
      ]);
    } else {
      setFooterHints([{ key: "Esc", description: "cancel" }]);
    }
  }, [phase, setFooterHints]);

  const contentWidth = Math.max(20, terminal.columns - 4);
  const parsedLines = useMemo(
    () => parseMarkdownStructure(streamContent || " ", contentWidth),
    [streamContent, contentWidth],
  );
  const reservedRows = 10;
  const contentHeight = Math.max(4, terminal.rows - reservedRows);
  const maxOffset = Math.max(0, parsedLines.length - contentHeight);

  // Auto-scroll during streaming, unless user has scrolled up
  const userScrolledRef = React.useRef(false);
  useEffect(() => {
    if (phase === "streaming" && !userScrolledRef.current) {
      setScrollOffset(maxOffset);
    }
  }, [maxOffset, phase]);

  const runPipeline = useCallback(
    async (youtubeUrl: string) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

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
        startPhaseTimer("submitting");
        setStatusText("Submitting URL…");

        const rawAddResponse = (await apiFetch("/v1/add", {
          query: { url: youtubeUrl, outputLang: "en" },
          token,
          apiUrl,
        })) as Record<string, unknown>;
        const addResponse = parseResponse(AddResponseSchema, rawAddResponse, "add-url");

        if (controller.signal.aborted) return;

        const tid = extractId(addResponse);
        if (!tid) {
          setErrorText("No transcription ID returned from API.");
          setPhase("error");
          return;
        }
        setTranscriptionId(tid);

        // Show title from add response if available
        const addTitle = pickValue(addResponse, ["title", "videoTitle", "name"]);
        if (addTitle) setTranscriptionTitle(addTitle);

        // 2. Poll for completion
        setPhase("processing");
        startPhaseTimer("processing");
        const maxAttempts = 120;
        let finalResponse: Record<string, unknown> | null = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (controller.signal.aborted) return;

          const statusResponse = (await apiFetch(`/v1/status/${tid}`, {
            token,
            apiUrl,
          })) as Record<string, unknown>;

          const currentStatus = extractStatus(statusResponse)?.toLowerCase() ?? "pending";
          setStatusText(`Processing… (${currentStatus})`);

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

        if (controller.signal.aborted) return;

        if (!finalResponse) {
          setErrorText("Timed out waiting for transcription to complete.");
          setPhase("error");
          return;
        }

        // 3. Create spike
        setPhase("creating-spike");
        startPhaseTimer("creating-spike");
        setStatusText("Creating spike…");

        const rawSpikeResponse = (await apiFetch(`/spikes/${tid}`, {
          method: "POST",
          body: { promptId: "formatted", outputLang: "en" },
          token,
          apiUrl,
        })) as Record<string, unknown>;
        const spikeResponse = parseResponse(SpikeCreateResponseSchema, rawSpikeResponse, "spike-create-add");

        if (controller.signal.aborted) return;

        const spikeId = spikeResponse.spikeId as string | undefined;

        // Check for cached content
        const cachedContent = (spikeResponse.content as string) ?? (spikeResponse.markdown as string);
        if (cachedContent) {
          setStreamContent(cachedContent);
          finishAllTimers();
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
        startPhaseTimer("streaming");
        setStatusText("Streaming content…");

        let fullContent = "";

        const streamPaths = [`/stream/spikes/${spikeId}`, `/spikes/stream/${spikeId}`];
        let streamed = false;
        let lastError: Error | null = null;

        for (const spath of streamPaths) {
          if (controller.signal.aborted) return;
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

        if (controller.signal.aborted) return;

        if (!streamed && lastError) {
          if (fullContent) {
            finishAllTimers();
            setPhase("done");
          } else {
            setErrorText(lastError.message);
            setPhase("error");
          }
          return;
        }

        finishAllTimers();
        setPhase("done");
      } catch (err) {
        if (controller.signal.aborted) return;
        setErrorText((err as Error).message);
        setPhase("error");
      } finally {
        abortControllerRef.current = null;
      }
    },
    [startPhaseTimer, finishAllTimers],
  );

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

    // Allow Esc to cancel during processing phases
    if (phase === "submitting" || phase === "processing" || phase === "creating-spike") {
      if (key.escape) {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        setPhase("input");
        setStatusText("");
        setPhaseTimers({});
        setTranscriptionId(null);
        return;
      }
      return;
    }

    if (phase === "done" || phase === "streaming") {
      if (key.escape || key.backspace) {
        onBack();
        return;
      }
      if (input.toLowerCase() === "y" && streamContent) {
        void copyToClipboard(streamContent).then((ok) => {
          if (ok) setNotice("Copied to clipboard");
        });
        return;
      }
      if (key.upArrow || input.toLowerCase() === "k") {
        userScrolledRef.current = true;
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input.toLowerCase() === "j") {
        setScrollOffset((prev) => {
          const next = Math.min(maxOffset, prev + 1);
          if (next >= maxOffset) userScrolledRef.current = false;
          return next;
        });
        return;
      }
    }
  });

  const visibleLines = renderMarkdownWindow(parsedLines, scrollOffset, contentHeight);

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
        <Box marginTop={1} flexDirection="column">
          {transcriptionId && <Text color={colors.secondary}>ID: {transcriptionId}</Text>}
          {transcriptionTitle && <Text color={colors.secondary}>{transcriptionTitle}</Text>}
          <Box marginTop={1} flexDirection="column">
            {PHASE_ORDER.map((p) => {
              const timer = phaseTimers[p];
              const isActive = p === phase;
              const isDone = timer?.done === true;
              const elapsed = timer ? Math.floor(timer.elapsed / 1000) : 0;

              let icon = "◯";
              if (isDone) icon = "✓";

              const label = PHASE_LABELS[p] ?? p;
              const timeStr = timer ? ` (${elapsed}s)` : "";

              if (isActive) {
                return (
                  <Box key={p} flexDirection="row">
                    <Text color={colors.primary}>
                      <InkSpinner type="dots" /> {label}
                      {timeStr}
                    </Text>
                  </Box>
                );
              }
              return (
                <Box key={p} flexDirection="row">
                  <Text color={isDone ? colors.success : colors.secondary}>
                    {icon} {label}
                    {timeStr}
                  </Text>
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1}>
            <Text color={colors.secondary}>Press Esc to cancel</Text>
          </Box>
        </Box>
      )}

      {phase === "streaming" && (
        <Box flexDirection="column" marginTop={1}>
          {transcriptionTitle && <Text color={colors.secondary}>{transcriptionTitle}</Text>}
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
          {transcriptionTitle && <Text color={colors.secondary}>{transcriptionTitle}</Text>}
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

      {notice && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>{notice}</Text>
        </Box>
      )}
    </Box>
  );
}

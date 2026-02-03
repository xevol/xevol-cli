import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { StatusBadge } from "../components/StatusBadge";
import { colors } from "../theme";
import { pickValue } from "../../lib/utils";
import { wrapText } from "../utils/wrapText";
import { renderMarkdownLines } from "../utils/renderMarkdown";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { streamSSE, type SSEEvent } from "../../lib/sse";
import { useLayout } from "../context/LayoutContext";

interface TerminalSize {
  columns: number;
  rows: number;
}

interface SpikeViewerProps {
  id: string;
  onBack: () => void;
  terminal: TerminalSize;
}

type RawItem = Record<string, unknown>;

function normalizeSpikes(data: Record<string, unknown>): RawItem[] {
  return (
    (data.spikes as RawItem[] | undefined) ??
    (data.data as RawItem[] | undefined) ??
    (data.items as RawItem[] | undefined) ??
    []
  );
}

function getSpikeContent(item: RawItem): string {
  return (
    (item.markdown as string | undefined) ??
    (item.content as string | undefined) ??
    (item.text as string | undefined) ??
    (item.body as string | undefined) ??
    ""
  );
}

function extractChunk(event: SSEEvent): string | null {
  if (event.event === "complete") {
    try {
      const parsed = JSON.parse(event.data) as {
        status?: string;
        data?: string;
        content?: string;
        markdown?: string;
      };
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

export function SpikeViewer({ id, onBack, terminal }: SpikeViewerProps): JSX.Element {
  const { setFooterHints } = useLayout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSpike, setActiveSpike] = useState<RawItem | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [streamContent, setStreamContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const { data, loading, error, refresh } = useApi<Record<string, unknown>>(
    "/spikes",
    {
      query: { transcriptionId: id },
    },
    [id],
  );

  const spikes = useMemo(() => normalizeSpikes(data ?? {}), [data]);

  useEffect(() => {
    if (selectedIndex >= spikes.length) {
      setSelectedIndex(Math.max(0, spikes.length - 1));
    }
  }, [selectedIndex, spikes.length]);

  useEffect(() => {
    if (activeSpike) {
      setFooterHints([
        { key: "↑/↓", description: "scroll" },
        { key: "r", description: "retry" },
        { key: "Esc", description: "back" },
      ]);
    } else {
      setFooterHints([
        { key: "↑/↓", description: "move" },
        { key: "Enter", description: "view" },
        { key: "r", description: "refresh" },
        { key: "Esc", description: "back" },
      ]);
    }
  }, [activeSpike, setFooterHints]);

  const selectedSpike = spikes[selectedIndex];

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const runStream = async () => {
      if (!activeSpike) {
        setStreamContent("");
        setStreaming(false);
        setStreamError(null);
        return;
      }

      const statusRaw = pickValue(activeSpike, ["status", "state"]);
      const status = statusRaw ? String(statusRaw).toLowerCase() : "";
      const spikeId = pickValue(activeSpike, ["id", "spikeId"])?.toString();
      const existingContent = getSpikeContent(activeSpike);

      setStreamContent(existingContent);
      setStreamError(null);

      if (!spikeId) return;
      if (status !== "pending" && status !== "processing") return;

      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        setStreamError(
          expired
            ? "Token expired. Run `xevol login` to re-authenticate."
            : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
        );
        return;
      }

      const apiUrl = resolveApiUrl(config);
      setStreaming(true);

      let fullContent = existingContent ?? "";
      try {
        const streamPaths = [`/stream/spikes/${spikeId}`, `/spikes/stream/${spikeId}`];
        let streamed = false;
        let lastError: Error | null = null;

        for (const path of streamPaths) {
          try {
            for await (const event of streamSSE(path, {
              token,
              apiUrl,
              signal: controller.signal,
            })) {
              if (!active) return;
              if (event.event === "error") {
                setStreamError(`Stream error: ${event.data}`);
                continue;
              }
              const chunk = extractChunk(event);
              if (chunk) {
                fullContent += chunk;
                setStreamContent(fullContent);
              }
            }
            streamed = true;
            lastError = null;
            break;
          } catch (err) {
            lastError = err as Error;
            if (controller.signal.aborted) return;
          }
        }

        if (!streamed && lastError) {
          throw lastError;
        }
      } catch (err) {
        if (active) {
          setStreamError((err as Error).message);
        }
      } finally {
        if (active) {
          setStreaming(false);
        }
      }
    };

    void runStream();

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeSpike]);

  const contentWidth = Math.max(20, terminal.columns - 4);
  const spikeContent = activeSpike ? (streamContent || getSpikeContent(activeSpike)) : "";
  const contentLines = useMemo(
    () => renderMarkdownLines(spikeContent || "No spike content available.", contentWidth),
    [spikeContent, contentWidth],
  );

  const reservedRows = 7 + (streamError ? 1 : 0) + (streaming ? 1 : 0);
  const contentHeight = Math.max(4, terminal.rows - reservedRows);
  const maxOffset = Math.max(0, contentLines.length - contentHeight);

  const userScrolledRef = React.useRef(false);
  useEffect(() => {
    if (streaming && !userScrolledRef.current) {
      setScrollOffset(maxOffset);
    } else if (!streaming) {
      setScrollOffset((prev) => Math.min(prev, maxOffset));
    }
  }, [maxOffset, streaming]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (activeSpike) {
      if (key.escape || key.backspace) {
        setActiveSpike(null);
        setScrollOffset(0);
        return;
      }

      if (lower === "r") {
        setStreamError(null);
        setActiveSpike({ ...activeSpike });
        return;
      }

      if (key.upArrow || lower === "k") {
        userScrolledRef.current = true;
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow || lower === "j") {
        setScrollOffset((prev) => {
          const next = Math.min(maxOffset, prev + 1);
          if (next >= maxOffset) userScrolledRef.current = false;
          return next;
        });
      }
      return;
    }

    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if (key.upArrow && spikes.length > 0) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow && spikes.length > 0) {
      setSelectedIndex((prev) => Math.min(spikes.length - 1, prev + 1));
      return;
    }

    if (lower === "r") {
      void refresh();
      return;
    }

    if (key.return && selectedSpike) {
      setActiveSpike(selectedSpike);
      setScrollOffset(0);
    }
  });

  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + contentHeight);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {loading && <Spinner label="Fetching spikes…" />}
      {error && <Text color={colors.error}>{error} (press r to retry)</Text>}

      {!loading && !error && activeSpike && (
        <Box flexDirection="column">
          <Text color={colors.primary}>
            Spike: {pickValue(activeSpike, ["promptName", "promptId", "prompt"]) ?? "Spike"}
          </Text>
          {streaming && (
            <Box marginTop={1}>
              <Text color={colors.secondary}>streaming…</Text>
            </Box>
          )}
          {streamError && (
            <Box marginTop={1}>
              <Text color={colors.error}>{streamError} (press r to retry)</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <Text>{visibleLines.join("\n")}</Text>
          </Box>
        </Box>
      )}

      {!loading && !error && !activeSpike && (
        <Box flexDirection="column">
          {spikes.length === 0 && <Text color={colors.secondary}>No spikes found.</Text>}
          {spikes.map((item, index) => {
            const isSelected = index === selectedIndex;
            const promptName = pickValue(item, ["promptName", "promptId", "prompt"]) ?? "Spike";
            const status = pickValue(item, ["status", "state"]) ?? "—";

            return (
              <Box key={pickValue(item, ["id", "spikeId"]) ?? `${promptName}-${index}`}>
                <Box width={2}>
                  <Text color={isSelected ? colors.primary : colors.secondary}>
                    {isSelected ? "›" : " "}
                  </Text>
                </Box>
                <Box flexDirection="row">
                  <StatusBadge status={status} />
                  <Text color={isSelected ? colors.primary : undefined}> {promptName}</Text>
                  <Text color={colors.secondary}> ({status})</Text>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

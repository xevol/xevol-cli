import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { promises as fs } from "fs";
import path from "path";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { StatusBadge } from "../components/StatusBadge";
import { colors } from "../theme";
import { pickValue } from "../../lib/utils";
import { formatDuration } from "../../lib/output";
import { openUrl } from "../utils/openUrl";
import { wrapText } from "../utils/wrapText";
import { buildMarkdownFromAnalysis } from "../utils/markdown";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { streamSSE, type SSEEvent } from "../../lib/sse";
import type { NavigationState } from "../hooks/useNavigation";
import type { Hint } from "../components/Footer";

interface TerminalSize {
  columns: number;
  rows: number;
}

interface TranscriptionDetailProps {
  id: string;
  navigation: Pick<NavigationState, "push">;
  onBack: () => void;
  terminal: TerminalSize;
  setFooterHints: (hints: Hint[]) => void;
}

type TabName = "transcript" | "spikes";

type RawItem = Record<string, unknown>;

function unwrapAnalysis(data: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!data) return null;
  if (data.analysis && typeof data.analysis === "object") {
    return data.analysis as Record<string, unknown>;
  }
  if (data.data && typeof data.data === "object") {
    return data.data as Record<string, unknown>;
  }
  return data;
}

function formatCreatedAt(raw?: string): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

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

export function TranscriptionDetail({
  id,
  navigation,
  onBack,
  terminal,
  setFooterHints,
}: TranscriptionDetailProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<TabName>("transcript");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Spike list state
  const [spikeSelectedIndex, setSpikeSelectedIndex] = useState(0);
  const [activeSpike, setActiveSpike] = useState<RawItem | null>(null);
  const [streamContent, setStreamContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { data, loading, error, refresh } = useApi<Record<string, unknown>>(`/v1/analysis/${id}`, {}, [id]);
  const analysis = useMemo(() => unwrapAnalysis(data), [data]);

  // Fetch spikes for this transcription
  const {
    data: spikesData,
    loading: spikesLoading,
    error: spikesError,
    refresh: refreshSpikes,
  } = useApi<Record<string, unknown>>(
    "/spikes",
    { query: { transcriptionId: id } },
    [id],
  );

  const spikes = useMemo(() => normalizeSpikes(spikesData ?? {}), [spikesData]);

  useEffect(() => {
    if (spikeSelectedIndex >= spikes.length) {
      setSpikeSelectedIndex(Math.max(0, spikes.length - 1));
    }
  }, [spikeSelectedIndex, spikes.length]);

  const title = pickValue(analysis ?? {}, ["title", "videoTitle", "name"]) ?? "Untitled";
  const channel = pickValue(analysis ?? {}, ["channel", "channelTitle", "author"]) ?? "Unknown";
  const status = pickValue(analysis ?? {}, ["status", "state"]) ?? "—";
  const duration = formatDuration(
    (analysis?.duration as number | string | undefined) ??
      (analysis?.durationSec as number | undefined) ??
      (analysis?.durationSeconds as number | undefined),
  );
  const language = pickValue(analysis ?? {}, ["lang", "outputLang", "language"]) ?? "—";
  const created = formatCreatedAt(analysis?.createdAt as string | undefined);
  const transcript =
    (analysis?.cleanContent as string | undefined) ??
    (analysis?.content as string | undefined) ??
    (analysis?.transcript as string | undefined) ??
    "";

  const contentWidth = Math.max(20, terminal.columns - 4);
  const transcriptLines = useMemo(
    () => wrapText(transcript || "No transcript content available.", contentWidth),
    [transcript, contentWidth],
  );

  // Spike content for active spike
  const spikeContent = activeSpike ? (streamContent || getSpikeContent(activeSpike)) : "";
  const spikeContentLines = useMemo(
    () => wrapText(spikeContent || "No spike content available.", contentWidth),
    [spikeContent, contentWidth],
  );

  const reservedRows = 12 + (notice ? 2 : 0);
  const contentHeight = Math.max(4, terminal.rows - reservedRows);

  const currentContentLines =
    activeTab === "transcript"
      ? transcriptLines
      : activeSpike
        ? spikeContentLines
        : [];

  const maxOffset = Math.max(0, currentContentLines.length - contentHeight);

  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, maxOffset));
  }, [maxOffset]);

  // Reset scroll when switching tabs
  useEffect(() => {
    setScrollOffset(0);
  }, [activeTab]);

  // Stream spike content
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
      const spikeStatus = statusRaw ? String(statusRaw).toLowerCase() : "";
      const spikeId = pickValue(activeSpike, ["id", "spikeId"])?.toString();
      const existingContent = getSpikeContent(activeSpike);

      setStreamContent(existingContent);
      setStreamError(null);

      if (!spikeId) return;
      if (spikeStatus !== "pending" && spikeStatus !== "processing") return;

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

        for (const spath of streamPaths) {
          try {
            for await (const event of streamSSE(spath, {
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

  // Auto-scroll when streaming
  useEffect(() => {
    if (streaming && activeTab === "spikes") {
      setScrollOffset(maxOffset);
    }
  }, [maxOffset, streaming, activeTab]);

  // Footer hints based on tab and state
  useEffect(() => {
    const common: Hint[] = [
      { key: "Tab/1/2", description: "switch tab" },
    ];

    if (activeTab === "transcript") {
      setFooterHints([
        ...common,
        { key: "↑/↓", description: "scroll" },
        { key: "e", description: "export" },
        { key: "o", description: "open" },
        { key: "r", description: "refresh" },
        { key: "Esc", description: "back" },
      ]);
    } else if (activeSpike) {
      setFooterHints([
        ...common,
        { key: "↑/↓", description: "scroll" },
        { key: "Esc", description: "back to list" },
      ]);
    } else {
      setFooterHints([
        ...common,
        { key: "↑/↓", description: "move" },
        { key: "Enter", description: "view spike" },
        { key: "r", description: "refresh" },
        { key: "Esc", description: "back" },
      ]);
    }
  }, [setFooterHints, activeTab, activeSpike]);

  const handleExport = useCallback(async () => {
    if (!analysis) {
      setNotice("No transcription loaded.");
      return;
    }

    setExporting(true);
    setNotice(null);
    try {
      const output = buildMarkdownFromAnalysis(analysis);
      if (!output.trim()) {
        setNotice("No transcript content available.");
        return;
      }
      const filename = `xevol-${id}.md`;
      const filePath = path.join(process.cwd(), filename);
      await fs.writeFile(filePath, output, "utf8");
      setNotice(`Exported to ${filename}`);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setExporting(false);
    }
  }, [analysis, id]);

  const handleOpen = useCallback(() => {
    const url =
      pickValue(analysis ?? {}, ["url", "youtubeUrl", "videoUrl"]) ??
      `https://xevol.com/t/${encodeURIComponent(id)}`;
    openUrl(url);
    setNotice("Opened in browser");
  }, [analysis, id]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    // Tab switching
    if (key.tab) {
      setActiveTab((prev) => (prev === "transcript" ? "spikes" : "transcript"));
      setActiveSpike(null);
      return;
    }
    if (input === "1") {
      setActiveTab("transcript");
      setActiveSpike(null);
      return;
    }
    if (input === "2") {
      setActiveTab("spikes");
      setActiveSpike(null);
      return;
    }

    // Escape / back
    if (key.escape || key.backspace) {
      if (activeTab === "spikes" && activeSpike) {
        setActiveSpike(null);
        setScrollOffset(0);
        return;
      }
      onBack();
      return;
    }

    if (lower === "r") {
      if (activeTab === "spikes" && activeSpike) {
        setStreamError(null);
        setActiveSpike({ ...activeSpike });
      } else if (activeTab === "spikes") {
        void refreshSpikes();
      } else {
        void refresh();
      }
      return;
    }

    // Transcript tab controls
    if (activeTab === "transcript") {
      if (key.upArrow || lower === "k") {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || lower === "j") {
        setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
        return;
      }
      if (lower === "e") {
        void handleExport();
        return;
      }
      if (lower === "o") {
        handleOpen();
        return;
      }
    }

    // Spikes tab controls
    if (activeTab === "spikes") {
      if (activeSpike) {
        // Viewing a spike's content
        if (key.upArrow || lower === "k") {
          setScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || lower === "j") {
          setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
          return;
        }
      } else {
        // Spike list navigation
        if (key.upArrow || lower === "k") {
          setSpikeSelectedIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || lower === "j") {
          setSpikeSelectedIndex((prev) => Math.min(spikes.length - 1, prev + 1));
          return;
        }
        if (key.return && spikes[spikeSelectedIndex]) {
          setActiveSpike(spikes[spikeSelectedIndex]);
          setScrollOffset(0);
          return;
        }
      }
    }
  });

  const visibleLines = currentContentLines.slice(scrollOffset, scrollOffset + contentHeight);

  // Tab bar component
  const tabBar = (
    <Box flexDirection="row" marginBottom={1}>
      <Text
        color={activeTab === "transcript" ? colors.primary : colors.secondary}
        bold={activeTab === "transcript"}
      >
        {activeTab === "transcript" ? "▸ " : "  "}1 Transcript
      </Text>
      <Text color={colors.secondary}>  │  </Text>
      <Text
        color={activeTab === "spikes" ? colors.primary : colors.secondary}
        bold={activeTab === "spikes"}
      >
        {activeTab === "spikes" ? "▸ " : "  "}2 Spikes
      </Text>
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {loading && <Spinner label="Fetching transcription…" />}
      {error && (
        <Text color={colors.error}>
          {error} (press r to retry)
        </Text>
      )}

      {!loading && !error && analysis && (
        <Box flexDirection="column">
          <Text color={colors.primary}>{title}</Text>
          <Box marginTop={1}>
            <Text color={colors.secondary}>Channel: {channel}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={colors.secondary}>Status: </Text>
            <StatusBadge status={status} />
            <Text color={colors.secondary}> {status}</Text>
          </Box>
          <Box flexDirection="row">
            <Text color={colors.secondary}>Duration: {duration}</Text>
            <Text color={colors.secondary}> · Lang: {language}</Text>
          </Box>
          <Box>
            <Text color={colors.secondary}>Created: {created}</Text>
          </Box>

          <Box marginTop={1}>{tabBar}</Box>

          {activeTab === "transcript" && (
            <Box flexDirection="column">
              <Text>{visibleLines.join("\n")}</Text>
            </Box>
          )}

          {activeTab === "spikes" && !activeSpike && (
            <Box flexDirection="column">
              {spikesLoading && <Spinner label="Fetching spikes…" />}
              {spikesError && (
                <Text color={colors.error}>{spikesError} (press r to retry)</Text>
              )}
              {!spikesLoading && !spikesError && spikes.length === 0 && (
                <Text color={colors.secondary}>No spikes found.</Text>
              )}
              {!spikesLoading &&
                !spikesError &&
                spikes.map((item, index) => {
                  const isSelected = index === spikeSelectedIndex;
                  const promptName = pickValue(item, ["promptName", "promptId", "prompt"]) ?? "Spike";
                  const spikeStatus = pickValue(item, ["status", "state"]) ?? "—";

                  return (
                    <Box key={pickValue(item, ["id", "spikeId"]) ?? `${promptName}-${index}`}>
                      <Box width={2}>
                        <Text color={isSelected ? colors.primary : colors.secondary}>
                          {isSelected ? "›" : " "}
                        </Text>
                      </Box>
                      <Box flexDirection="row">
                        <StatusBadge status={spikeStatus} />
                        <Text color={isSelected ? colors.primary : undefined}> {promptName}</Text>
                        <Text color={colors.secondary}> ({spikeStatus})</Text>
                      </Box>
                    </Box>
                  );
                })}
            </Box>
          )}

          {activeTab === "spikes" && activeSpike && (
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
        </Box>
      )}

      {!loading && !error && !analysis && (
        <Text color={colors.secondary}>No transcription data available.</Text>
      )}

      {exporting && (
        <Box marginTop={1}>
          <Spinner label="Exporting…" />
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { promises as fs } from "fs";
import path from "path";
import { useApi } from "../hooks/useApi";
import { apiFetch } from "../../lib/api";
import { Spinner } from "../components/Spinner";
import { StatusBadge } from "../components/StatusBadge";
import { colors } from "../theme";
import { pickValue } from "../../lib/utils";
import { formatDuration } from "../../lib/output";
import { openUrl } from "../utils/openUrl";
import { wrapText } from "../utils/wrapText";
import { renderMarkdownLines } from "../utils/renderMarkdown";
import { buildMarkdownFromAnalysis } from "../utils/markdown";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { addToHistory } from "../../lib/history";
import { streamSSE, type SSEEvent } from "../../lib/sse";
import { copyToClipboard } from "../utils/clipboard";
import type { NavigationState } from "../hooks/useNavigation";
import { useLayout } from "../context/LayoutContext";
import { parseResponse } from "../../lib/parseResponse";
import { AnalysisResponseSchema, PromptsResponseSchema, SpikeCreateResponseSchema } from "../../lib/schemas";

interface TerminalSize {
  columns: number;
  rows: number;
}

interface TranscriptionDetailProps {
  id: string;
  navigation: Pick<NavigationState, "push">;
  onBack: () => void;
  terminal: TerminalSize;
}

type TabName = "transcript" | "spikes";

type RawItem = Record<string, unknown>;

interface Prompt {
  id: string;
  name: string;
  description?: string;
}

/** Prompts to pin at the top of the list (most commonly used). */
const FEATURED_PROMPT_IDS = ["formatted", "summary", "wisdom", "insights", "facts"];

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

/** Extract a short one-line description from the full prompt description. */
function shortDescription(desc: string | undefined, maxLen = 60): string {
  if (!desc) return "";
  // Strip markdown headers and formatting
  let clean = desc.replace(/^#+\s+.*/gm, "").replace(/[*_`#]/g, "").trim();
  // Take first sentence (up to first period or maxLen)
  const periodIdx = clean.indexOf(".");
  if (periodIdx > 0 && periodIdx < maxLen) {
    clean = clean.slice(0, periodIdx + 1);
  } else if (clean.length > maxLen) {
    clean = `${clean.slice(0, maxLen)}…`;
  }
  // Collapse whitespace
  return clean.replace(/\s+/g, " ").trim();
}

/** Sort prompts: featured first (in FEATURED order), then the rest alphabetically. */
function sortPrompts(prompts: Prompt[]): Prompt[] {
  const featured: Prompt[] = [];
  const rest: Prompt[] = [];
  for (const id of FEATURED_PROMPT_IDS) {
    const p = prompts.find((pr) => pr.id === id);
    if (p) featured.push(p);
  }
  for (const p of prompts) {
    if (!FEATURED_PROMPT_IDS.includes(p.id)) rest.push(p);
  }
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return [...featured, ...rest];
}

/**
 * Extract content from SSE events for spike streaming.
 * API sends: {type:"token",content:"..."}, {type:"full",content:"..."}, {type:"done"}, {type:"error",error:"..."}
 */
function extractSpikeChunk(event: SSEEvent): { action: "append" | "replace" | "done" | "error"; content: string } | null {
  // Handle JSON event stream from the spike API
  try {
    const parsed = JSON.parse(event.data) as { type?: string; content?: string; error?: string };
    if (parsed.type === "token") {
      return { action: "append", content: parsed.content ?? "" };
    }
    if (parsed.type === "full") {
      return { action: "replace", content: parsed.content ?? "" };
    }
    if (parsed.type === "done") {
      return { action: "done", content: "" };
    }
    if (parsed.type === "error") {
      return { action: "error", content: parsed.error ?? "Unknown stream error" };
    }
  } catch {
    // Not JSON — fall through
  }

  // Fallback: streamSSE may yield a synthetic "complete" event for JSON responses
  if (event.event === "complete") {
    try {
      const parsed = JSON.parse(event.data) as { content?: string; data?: string; markdown?: string };
      return { action: "replace", content: parsed.content ?? parsed.data ?? parsed.markdown ?? event.data };
    } catch {
      return { action: "replace", content: event.data };
    }
  }

  // Fallback for chunk/delta events
  if (event.event === "chunk" || event.event === "delta" || !event.event) {
    try {
      const parsed = JSON.parse(event.data) as { text?: string; content?: string; chunk?: string; delta?: string };
      const text = parsed.text ?? parsed.content ?? parsed.chunk ?? parsed.delta ?? event.data;
      return { action: "append", content: text };
    } catch {
      return { action: "append", content: event.data };
    }
  }

  if (event.event === "done" || event.event === "end") {
    return { action: "done", content: "" };
  }

  return null;
}

export function TranscriptionDetail({
  id,
  navigation,
  onBack,
  terminal,
}: TranscriptionDetailProps): JSX.Element {
  const { setFooterHints } = useLayout();
  const [activeTab, setActiveTab] = useState<TabName>("transcript");
  const [scrollOffset, setScrollOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Spikes tab state — prompt list + spike viewing
  const [promptSelectedIndex, setPromptSelectedIndex] = useState(0);
  const [spikeContent, setSpikeContent] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [creatingSpike, setCreatingSpike] = useState(false);
  const [activePromptName, setActivePromptName] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { data: rawDetailData, loading: rawDetailLoading, error, refresh } = useApi<Record<string, unknown>>(`/v1/analysis/${id}`, {}, [id]);
  const prevDetailRef = useRef<Record<string, unknown> | null>(null);
  const validatedDetailData = rawDetailData ? parseResponse(AnalysisResponseSchema, rawDetailData, "analysis-detail") : null;
  const data = validatedDetailData ?? prevDetailRef.current;
  useEffect(() => {
    if (validatedDetailData) prevDetailRef.current = validatedDetailData;
  }, [validatedDetailData]);
  // Only show loading spinner when no data exists yet (stale-while-revalidate)
  const loading = rawDetailLoading && !data;
  const analysis = useMemo(() => unwrapAnalysis(data), [data]);

  // Fetch available prompts
  const {
    data: rawPromptsData,
    loading: rawPromptsLoading,
    error: promptsError,
    refresh: refreshPrompts,
  } = useApi<Record<string, unknown>>("/v1/prompts", {}, []);
  const prevPromptsRef = useRef<Record<string, unknown> | null>(null);
  const validatedPromptsData = rawPromptsData ? parseResponse(PromptsResponseSchema, rawPromptsData, "prompts") : null;
  const promptsData = validatedPromptsData ?? prevPromptsRef.current;
  useEffect(() => {
    if (validatedPromptsData) prevPromptsRef.current = validatedPromptsData;
  }, [validatedPromptsData]);
  const promptsLoading = rawPromptsLoading && !promptsData;

  const prompts = useMemo(() => {
    const raw = (promptsData as any)?.prompts ?? (promptsData as any)?.data ?? [];
    return sortPrompts(
      (raw as any[]).map((p: any) => ({
        id: p.id ?? p.slug ?? "",
        name: p.name ?? p.title ?? p.id ?? "",
        description: p.description ?? "",
      })),
    );
  }, [promptsData]);

  useEffect(() => {
    if (promptSelectedIndex >= prompts.length && prompts.length > 0) {
      setPromptSelectedIndex(Math.max(0, prompts.length - 1));
    }
  }, [promptSelectedIndex, prompts.length]);

  const title = pickValue(analysis ?? {}, ["title", "videoTitle", "name"]) ?? "Untitled";
  const channel = pickValue(analysis ?? {}, ["channel", "channelTitle", "author"]) ?? "Unknown";

  // Track in local history when detail loads
  useEffect(() => {
    if (analysis && title && title !== "Untitled" && id) {
      void addToHistory(id, title);
    }
  }, [analysis, title, id]);
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
    () => renderMarkdownLines(transcript || "No transcript content available.", contentWidth),
    [transcript, contentWidth],
  );

  const spikeContentLines = useMemo(
    () => renderMarkdownLines(spikeContent || "", contentWidth),
    [spikeContent, contentWidth],
  );

  const reservedRows = 12 + (notice ? 2 : 0);
  const contentHeight = Math.max(4, terminal.rows - reservedRows);

  const currentContentLines =
    activeTab === "transcript"
      ? transcriptLines
      : spikeContent !== null
        ? spikeContentLines
        : [];

  const maxOffset = Math.max(0, currentContentLines.length - contentHeight);

  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, maxOffset));
  }, [maxOffset]);

  // Reset scroll when switching tabs
  useEffect(() => {
    setScrollOffset(0);
    userScrolledRef.current = false;
  }, [activeTab]);

  // Create spike and stream content
  const createAndStreamSpike = useCallback(async (prompt: Prompt) => {
    setActivePromptName(prompt.name);
    setSpikeContent("");
    setStreamError(null);
    setCreatingSpike(true);
    setScrollOffset(0);

    const config = (await readConfig()) ?? {};
    const { token, expired } = resolveToken(config);
    if (!token) {
      setStreamError(
        expired
          ? "Token expired. Run `xevol login` to re-authenticate."
          : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
      );
      setCreatingSpike(false);
      return;
    }

    const apiUrl = resolveApiUrl(config);

    try {
      // POST to create the spike
      const rawResponse = await apiFetch<Record<string, unknown>>(`/spikes/${id}`, {
        method: "POST",
        body: { promptId: prompt.id, outputLang: "en" },
        token,
        apiUrl,
      });
      const response = parseResponse(SpikeCreateResponseSchema, rawResponse, "spike-create");

      setCreatingSpike(false);

      // Check for cached content
      const cachedContent = (response.content as string | undefined) ?? (response.markdown as string | undefined);
      if (cachedContent) {
        setSpikeContent(cachedContent);
        return;
      }

      // Need to stream
      const spikeId = (response.spikeId as string | undefined) ?? (response.id as string | undefined);
      if (!spikeId) {
        setStreamError("No spikeId returned from API");
        return;
      }

      setStreaming(true);
      let fullContent = "";

      const controller = new AbortController();
      // Store controller so cleanup can abort
      streamControllerRef.current = controller;

      try {
        for await (const event of streamSSE(`/spikes/stream/${spikeId}`, {
          token,
          apiUrl,
          signal: controller.signal,
        })) {
          const result = extractSpikeChunk(event);
          if (!result) continue;

          if (result.action === "append") {
            fullContent += result.content;
            setSpikeContent(fullContent);
          } else if (result.action === "replace") {
            fullContent = result.content;
            setSpikeContent(fullContent);
          } else if (result.action === "error") {
            setStreamError(result.content);
            break;
          } else if (result.action === "done") {
            break;
          }
        }
      } finally {
        setStreaming(false);
        streamControllerRef.current = null;
      }
    } catch (err) {
      setCreatingSpike(false);
      setStreaming(false);
      setStreamError((err as Error).message);
    }
  }, [id]);

  const streamControllerRef = React.useRef<AbortController | null>(null);

  // Cleanup stream on unmount
  useEffect(() => {
    return () => {
      streamControllerRef.current?.abort();
    };
  }, []);

  // Auto-scroll when streaming, unless user has scrolled up
  const userScrolledRef = React.useRef(false);
  useEffect(() => {
    if (streaming && activeTab === "spikes" && !userScrolledRef.current) {
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
        { key: "y", description: "copy" },
        { key: "e", description: "export" },
        { key: "o", description: "open" },
        { key: "r", description: "refresh" },
        { key: "Esc", description: "back" },
      ]);
    } else if (spikeContent !== null) {
      setFooterHints([
        ...common,
        { key: "↑/↓", description: "scroll" },
        { key: "y", description: "copy" },
        { key: "Esc", description: "back to prompts" },
      ]);
    } else {
      setFooterHints([
        ...common,
        { key: "↑/↓", description: "move" },
        { key: "Enter", description: "run spike" },
        { key: "r", description: "refresh" },
        { key: "Esc", description: "back" },
      ]);
    }
  }, [setFooterHints, activeTab, spikeContent]);

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
      setSpikeContent(null);
      setActivePromptName(null);
      return;
    }
    if (input === "1") {
      setActiveTab("transcript");
      setSpikeContent(null);
      setActivePromptName(null);
      return;
    }
    if (input === "2") {
      setActiveTab("spikes");
      setSpikeContent(null);
      setActivePromptName(null);
      return;
    }

    // Escape / back
    if (key.escape || key.backspace) {
      if (activeTab === "spikes" && spikeContent !== null) {
        streamControllerRef.current?.abort();
        setSpikeContent(null);
        setActivePromptName(null);
        setStreaming(false);
        setStreamError(null);
        setScrollOffset(0);
        return;
      }
      onBack();
      return;
    }

    if (lower === "r") {
      if (activeTab === "spikes") {
        void refreshPrompts();
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
      if (input === "g") {
        setScrollOffset(0);
        return;
      }
      if (input === "G") {
        setScrollOffset(maxOffset);
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
      if (lower === "y") {
        if (transcript) {
          void copyToClipboard(transcript).then((ok) => {
            if (ok) setNotice("Copied transcript to clipboard");
          });
        }
        return;
      }
    }

    // Spikes tab controls
    if (activeTab === "spikes") {
      if (spikeContent !== null) {
        // Viewing spike content
        if (lower === "y" && spikeContent) {
          void copyToClipboard(spikeContent).then((ok) => {
            if (ok) setNotice("Copied spike content to clipboard");
          });
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
          return;
        }
        if (input === "g") {
          userScrolledRef.current = true;
          setScrollOffset(0);
          return;
        }
        if (input === "G") {
          userScrolledRef.current = false;
          setScrollOffset(maxOffset);
          return;
        }
      } else {
        // Prompt list navigation
        if (key.upArrow || lower === "k") {
          setPromptSelectedIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (key.downArrow || lower === "j") {
          setPromptSelectedIndex((prev) => Math.min(prompts.length - 1, prev + 1));
          return;
        }
        if (input === "g") {
          setPromptSelectedIndex(0);
          return;
        }
        if (input === "G") {
          setPromptSelectedIndex(Math.max(0, prompts.length - 1));
          return;
        }
        if (key.return && prompts[promptSelectedIndex] && !creatingSpike && !streaming) {
          void createAndStreamSpike(prompts[promptSelectedIndex]);
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
        {activeTab === "transcript" ? "▸ " : "  "}Transcript
      </Text>
      <Text color={colors.secondary}>  │  </Text>
      <Text
        color={activeTab === "spikes" ? colors.primary : colors.secondary}
        bold={activeTab === "spikes"}
      >
        {activeTab === "spikes" ? "▸ " : "  "}Spikes
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

          {activeTab === "spikes" && spikeContent === null && (
            <Box flexDirection="column">
              {promptsLoading && <Spinner label="Fetching prompts…" />}
              {promptsError && (
                <Text color={colors.error}>{promptsError} (press r to retry)</Text>
              )}
              {!promptsLoading && !promptsError && prompts.length === 0 && (
                <Text color={colors.secondary}>No prompts available.</Text>
              )}
              {!promptsLoading &&
                !promptsError &&
                (() => {
                  const maxVisible = Math.max(4, terminal.rows - 14);
                  const maxStart = Math.max(0, prompts.length - maxVisible);
                  const windowStart = Math.min(
                    Math.max(0, promptSelectedIndex - Math.floor(maxVisible / 2)),
                    maxStart,
                  );
                  const visible = prompts.slice(windowStart, windowStart + maxVisible);

                  // Calculate max name length for alignment
                  const maxNameLen = Math.max(...visible.map((p) => p.name.length), 0);
                  const nameColWidth = Math.min(maxNameLen + 1, 20);

                  return visible.map((prompt, i) => {
                    const realIndex = windowStart + i;
                    const isSelected = realIndex === promptSelectedIndex;
                    const isFeatured = FEATURED_PROMPT_IDS.includes(prompt.id);
                    const desc = shortDescription(prompt.description);
                    const prefixLen = 2 + 2 + nameColWidth; // cursor + star + name
                    const descMaxLen = Math.max(0, contentWidth - prefixLen - 2);
                    const truncDesc = desc.length > descMaxLen ? `${desc.slice(0, descMaxLen)}…` : desc;

                    return (
                      <Box key={prompt.id}>
                        <Box width={2}>
                          <Text color={isSelected ? colors.primary : colors.secondary}>
                            {isSelected ? "›" : " "}
                          </Text>
                        </Box>
                        <Box flexDirection="row">
                          <Text color={isSelected ? colors.primary : undefined}>
                            {isFeatured ? "★ " : "  "}{prompt.name.padEnd(nameColWidth)}
                          </Text>
                          {truncDesc ? (
                            <Text color={colors.secondary}> {truncDesc}</Text>
                          ) : null}
                        </Box>
                      </Box>
                    );
                  });
                })()}
            </Box>
          )}

          {activeTab === "spikes" && spikeContent !== null && (
            <Box flexDirection="column">
              <Text color={colors.primary}>
                {activePromptName ?? "Spike"}
                {creatingSpike ? " · creating…" : streaming ? " · streaming…" : ""}
              </Text>
              {streamError && (
                <Box marginTop={1}>
                  <Text color={colors.error}>{streamError} (press r to retry)</Text>
                </Box>
              )}
              {creatingSpike && !spikeContent && (
                <Box marginTop={1}>
                  <Spinner label="Generating spike…" />
                </Box>
              )}
              {streaming && !spikeContent && (
                <Box marginTop={1}>
                  <Spinner label="Waiting for content…" />
                </Box>
              )}
              {!creatingSpike && !streaming && !streamError && !spikeContent && (
                <Box marginTop={1}>
                  <Text color={colors.secondary}>No content returned.</Text>
                </Box>
              )}
              {spikeContent ? (
                <Box marginTop={1}>
                  <Text>{visibleLines.join("\n")}</Text>
                </Box>
              ) : null}
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

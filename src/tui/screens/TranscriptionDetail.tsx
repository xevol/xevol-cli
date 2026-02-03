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

export function TranscriptionDetail({
  id,
  navigation,
  onBack,
  terminal,
  setFooterHints,
}: TranscriptionDetailProps): JSX.Element {
  const [scrollOffset, setScrollOffset] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { data, loading, error, refresh } = useApi<Record<string, unknown>>(`/v1/analysis/${id}`, {}, [id]);
  const analysis = useMemo(() => unwrapAnalysis(data), [data]);

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
  const contentLines = useMemo(
    () => wrapText(transcript || "No transcript content available.", contentWidth),
    [transcript, contentWidth],
  );

  const reservedRows = 10 + (notice ? 2 : 0);
  const contentHeight = Math.max(4, terminal.rows - reservedRows);
  const maxOffset = Math.max(0, contentLines.length - contentHeight);

  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, maxOffset));
  }, [maxOffset]);

  useEffect(() => {
    setFooterHints([
      { key: "↑/↓", description: "scroll" },
      { key: "s", description: "spikes" },
      { key: "e", description: "export" },
      { key: "o", description: "open" },
      { key: "r", description: "refresh" },
      { key: "Esc", description: "back" },
    ]);
  }, [setFooterHints]);

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

    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if (lower === "r") {
      void refresh();
      return;
    }

    if (key.upArrow || lower === "k") {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow || lower === "j") {
      setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
      return;
    }

    if (lower === "s") {
      navigation.push("spike-viewer", { id });
      return;
    }

    if (lower === "e") {
      void handleExport();
      return;
    }

    if (lower === "o") {
      handleOpen();
    }
  });

  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + contentHeight);

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

          <Box marginTop={1}>
            <Text color={colors.secondary}>Transcript</Text>
          </Box>
          <Box flexDirection="column">
            <Text>{visibleLines.join("\n")}</Text>
          </Box>
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

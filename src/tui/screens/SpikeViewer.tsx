import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { StatusBadge } from "../components/StatusBadge";
import { colors } from "../theme";
import { pickValue } from "../../lib/utils";
import { wrapText } from "../utils/wrapText";

interface SpikeViewerProps {
  id: string;
  onBack: () => void;
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

export function SpikeViewer({ id, onBack }: SpikeViewerProps): JSX.Element {
  const { stdout } = useStdout();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeSpike, setActiveSpike] = useState<RawItem | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const { data, loading, error } = useApi<Record<string, unknown>>("/spikes", {
    query: { transcriptionId: id },
  }, [id]);

  const spikes = useMemo(() => normalizeSpikes(data ?? {}), [data]);

  useEffect(() => {
    if (selectedIndex >= spikes.length) {
      setSelectedIndex(Math.max(0, spikes.length - 1));
    }
  }, [selectedIndex, spikes.length]);

  const selectedSpike = spikes[selectedIndex];

  const contentWidth = Math.max(20, (stdout.columns ?? 80) - 4);
  const spikeContent = activeSpike ? getSpikeContent(activeSpike) : "";
  const contentLines = useMemo(
    () => wrapText(spikeContent || "No spike content available.", contentWidth),
    [spikeContent, contentWidth],
  );

  const reservedRows = 6;
  const contentHeight = Math.max(4, (stdout.rows ?? 24) - reservedRows);
  const maxOffset = Math.max(0, contentLines.length - contentHeight);

  useEffect(() => {
    setScrollOffset((prev) => Math.min(prev, maxOffset));
  }, [maxOffset]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (activeSpike) {
      if (key.escape || key.backspace) {
        setActiveSpike(null);
        setScrollOffset(0);
        return;
      }

      if (key.upArrow || lower === "k") {
        setScrollOffset((prev) => Math.max(0, prev - 1));
        return;
      }

      if (key.downArrow || lower === "j") {
        setScrollOffset((prev) => Math.min(maxOffset, prev + 1));
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

    if (key.return && selectedSpike) {
      setActiveSpike(selectedSpike);
      setScrollOffset(0);
    }
  });

  const visibleLines = contentLines.slice(scrollOffset, scrollOffset + contentHeight);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {loading && <Spinner label="Fetching spikes…" />}
      {error && <Text color={colors.error}>{error}</Text>}

      {!loading && !error && activeSpike && (
        <Box flexDirection="column">
          <Text color={colors.primary}>
            Spike: {pickValue(activeSpike, ["promptName", "promptId", "prompt"]) ?? "Spike"}
          </Text>
          <Box marginTop={1}>
            <Text>{visibleLines.join("\n")}</Text>
          </Box>
        </Box>
      )}

      {!loading && !error && !activeSpike && (
        <Box flexDirection="column">
          {spikes.length === 0 && (
            <Text color={colors.secondary}>No spikes found.</Text>
          )}
          {spikes.map((item, index) => {
            const isSelected = index === selectedIndex;
            const promptName =
              pickValue(item, ["promptName", "promptId", "prompt"]) ?? "Spike";
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

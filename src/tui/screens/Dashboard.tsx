import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { pickValueOrDash } from "../../lib/utils";
import { formatTimeAgo } from "../utils/time";
import { getHistory, type HistoryEntry } from "../../lib/history";
import type { NavigationState } from "../hooks/useNavigation";
import { useLayout } from "../context/LayoutContext";
import { parseResponse } from "../../lib/parseResponse";
import { TranscriptionListResponseSchema } from "../../lib/schemas";

// Module-level cache to avoid flash on re-mount
let _historyCache: HistoryEntry[] | null = null;

interface DashboardProps {
  version: string;
  navigation: Pick<NavigationState, "push">;
}

const LOGO_LINES = [
  "                          ██ ",
  "  ██ ██ ▄█▀█▄ ██ ██ ▄███▄ ██ ",
  "   ███  ██▄█▀ ██▄██ ██ ██ ██ ",
  "  ██ ██ ▀█▄▄▄  ▀█▀  ▀███▀ ██",
];

type MenuValue = "transcriptions" | "add-url" | "workspaces" | "settings" | "help" | "quit";

const MENU_ITEMS: Array<{ label: string; value: MenuValue }> = [
  { label: "📋 Transcriptions", value: "transcriptions" },
  { label: "➕ Add URL", value: "add-url" },
  { label: "🏢 Workspaces", value: "workspaces" },
  { label: "🔧 Settings", value: "settings" },
  { label: "❓ Help", value: "help" },
  { label: "🚪 Quit", value: "quit" },
];

interface RecentItem {
  id: string;
  title: string;
  created: string;
}

type RawItem = Record<string, unknown>;

function normalizeRecent(data: Record<string, unknown>): RawItem[] {
  return (
    (data.list as RawItem[] | undefined) ??
    (data.data as RawItem[] | undefined) ??
    (data.transcriptions as RawItem[] | undefined) ??
    (data.items as RawItem[] | undefined) ??
    (data.results as RawItem[] | undefined) ??
    []
  );
}

export function Dashboard({ version, navigation }: DashboardProps): JSX.Element {
  const { exit } = useApp();
  const { setFooterHints, setFooterStatus } = useLayout();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Local history — use module-level cache for instant initial render (no flash)
  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>(_historyCache ?? []);
  const [historyLoaded, setHistoryLoaded] = useState(_historyCache !== null);

  useEffect(() => {
    void (async () => {
      const history = await getHistory();
      _historyCache = history;
      setHistoryItems(history);
      setHistoryLoaded(true);
    })();
  }, []);

  const hasLocalHistory = historyItems.length > 0;

  // API recent — only fetch if no local history
  const {
    data: rawRecentData,
    loading: rawRecentLoading,
    error: recentError,
    refresh: refreshRecent,
  } = useApi<Record<string, unknown>>(
    "/v1/transcriptions",
    {
      query: { limit: 3 },
    },
    [],
  );

  // Validate response
  const recentData = rawRecentData ? parseResponse(TranscriptionListResponseSchema, rawRecentData, "dashboard-recent") : null;

  // Suppress loading indicator when we have data (useApi provides stale-while-revalidate)
  const recentLoading = rawRecentLoading && !recentData;

  // Auto-refresh removed — users can press `r` to refresh

  useEffect(() => {
    setFooterHints([
      { key: "↑/↓", description: "move" },
      { key: "Enter", description: "select/toggle" },
      { key: "a", description: "add URL" },
      { key: "r", description: "refresh" },
      { key: "?", description: "help" },
      { key: "q", description: "quit" },
    ]);
    setFooterStatus(undefined);
  }, [setFooterHints, setFooterStatus]);

  // Recently Viewed — from local history
  const recentlyViewed = useMemo<RecentItem[]>(() => {
    return historyItems.slice(0, 3).map((entry) => ({
      id: entry.id,
      title: entry.title,
      created: formatTimeAgo(entry.viewedAt),
    }));
  }, [historyItems]);

  // Recently Added — from API
  const recentlyAdded = useMemo<RecentItem[]>(() => {
    const rawItems = normalizeRecent(recentData ?? {});
    return rawItems.slice(0, 3).map((item) => ({
      id: pickValueOrDash(item, ["id", "transcriptionId", "_id"]),
      title: pickValueOrDash(item, ["title", "videoTitle", "name"]),
      created: formatTimeAgo(item.createdAt as string | undefined),
    }));
  }, [recentData]);

  const selectableCount = MENU_ITEMS.length + recentlyViewed.length + recentlyAdded.length;

  useEffect(() => {
    if (selectedIndex >= selectableCount) {
      setSelectedIndex(Math.max(0, selectableCount - 1));
    }
  }, [selectableCount, selectedIndex]);

  useInput((input, key) => {
    const lower = input.toLowerCase();
    if (key.upArrow || lower === "k") {
      if (selectableCount > 0) {
        setSelectedIndex((prev) => (prev <= 0 ? selectableCount - 1 : prev - 1));
      }
      return;
    }

    if (key.downArrow || lower === "j") {
      if (selectableCount > 0) {
        setSelectedIndex((prev) => (prev >= selectableCount - 1 ? 0 : prev + 1));
      }
      return;
    }

    if (lower === "r") {
      void refreshRecent();
      return;
    }

    if (lower === "a") {
      navigation.push("add-url");
      return;
    }

    if (key.return) {
      if (selectedIndex < MENU_ITEMS.length) {
        const item = MENU_ITEMS[selectedIndex];
        if (item.value === "transcriptions") {
          navigation.push("list");
          return;
        }
        if (item.value === "add-url") {
          navigation.push("add-url");
          return;
        }
        if (item.value === "workspaces") {
          navigation.push("workspaces");
          return;
        }
        if (item.value === "settings") {
          navigation.push("settings");
          return;
        }
        if (item.value === "help") {
          navigation.push("help");
          return;
        }
        if (item.value === "quit") {
          exit();
        }
      } else {
        const afterMenu = selectedIndex - MENU_ITEMS.length;
        if (afterMenu < recentlyViewed.length) {
          const item = recentlyViewed[afterMenu];
          if (item?.id) {
            navigation.push("detail", { id: item.id });
          }
        } else {
          const addedIndex = afterMenu - recentlyViewed.length;
          const item = recentlyAdded[addedIndex];
          if (item?.id) {
            navigation.push("detail", { id: item.id });
          }
        }
      }
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        {MENU_ITEMS.map((item, index) => {
          const isSelected = selectedIndex === index;
          return (
            <Box key={item.value} flexDirection="row">
              <Box width={2}>
                <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
              </Box>
              <Text color={isSelected ? colors.primary : undefined}>{item.label}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Recently Viewed — local history */}
      <Box flexDirection="column">
        <Text color={colors.secondary}>Recently viewed</Text>
        {!historyLoaded && (
          <Box marginTop={1}>
            <Spinner label="Loading history…" />
          </Box>
        )}
        {historyLoaded && recentlyViewed.length === 0 && (
          <Box marginTop={1}>
            <Text color={colors.secondary}>No recently viewed.</Text>
          </Box>
        )}
        {recentlyViewed.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {recentlyViewed.map((item, index) => {
              const absoluteIndex = MENU_ITEMS.length + index;
              const isSelected = selectedIndex === absoluteIndex;
              return (
                <Box key={item.id} flexDirection="row">
                  <Box width={2}>
                    <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
                  </Box>
                  <Box flexDirection="row" justifyContent="space-between" flexGrow={1}>
                    <Text color={isSelected ? colors.primary : undefined}>{item.title}</Text>
                    <Text color={colors.secondary}>{item.created}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      {/* Recently Added — from API */}
      <Box flexDirection="column" marginTop={1}>
        <Text color={colors.secondary}>Recently added</Text>
        {recentLoading && (
          <Box marginTop={1}>
            <Spinner label="Loading recent…" />
          </Box>
        )}
        {recentError && (
          <Box marginTop={1}>
            <Text color={colors.error}>{recentError} (press r to retry)</Text>
          </Box>
        )}
        {!recentLoading && !recentError && recentlyAdded.length === 0 && (
          <Box marginTop={1}>
            <Text color={colors.secondary}>No recent transcriptions.</Text>
          </Box>
        )}
        {!recentLoading && !recentError && recentlyAdded.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {recentlyAdded.map((item, index) => {
              const absoluteIndex = MENU_ITEMS.length + recentlyViewed.length + index;
              const isSelected = selectedIndex === absoluteIndex;
              return (
                <Box key={item.id} flexDirection="row">
                  <Box width={2}>
                    <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
                  </Box>
                  <Box flexDirection="row" justifyContent="space-between" flexGrow={1}>
                    <Text color={isSelected ? colors.primary : undefined}>{item.title}</Text>
                    <Text color={colors.secondary}>{item.created}</Text>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </Box>
  );
}

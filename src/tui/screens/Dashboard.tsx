import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { pickValueOrDash } from "../../lib/utils";
import { formatTimeAgo } from "../utils/time";
import type { NavigationState } from "../hooks/useNavigation";
import type { Hint } from "../components/Footer";

// Module-level cache so navigating away and back doesn't re-fetch
let _cachedRecent: Record<string, unknown> | null = null;

interface DashboardProps {
  version: string;
  navigation: Pick<NavigationState, "push">;
  setFooterHints: (hints: Hint[]) => void;
  setFooterStatus: (status?: string) => void;
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

export function Dashboard({ version, navigation, setFooterHints, setFooterStatus }: DashboardProps): JSX.Element {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);

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

  // Update cache when fresh data arrives
  const recentData = rawRecentData ?? _cachedRecent;

  useEffect(() => {
    if (rawRecentData) _cachedRecent = rawRecentData;
  }, [rawRecentData]);

  // Suppress loading indicator when we have cached data (no flash on re-visit)
  const recentLoading = rawRecentLoading && !_cachedRecent;

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

  const recentItems = useMemo<RecentItem[]>(() => {
    const rawItems = normalizeRecent(recentData ?? {});
    return rawItems.slice(0, 3).map((item) => ({
      id: pickValueOrDash(item, ["id", "transcriptionId", "_id"]),
      title: pickValueOrDash(item, ["title", "videoTitle", "name"]),
      created: formatTimeAgo(item.createdAt as string | undefined),
    }));
  }, [recentData]);

  const selectableCount = MENU_ITEMS.length + recentItems.length;

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
        const recentIndex = selectedIndex - MENU_ITEMS.length;
        const recentItem = recentItems[recentIndex];
        if (recentItem?.id) {
          navigation.push("detail", { id: recentItem.id });
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

      <Box flexDirection="column">
        <Text color={colors.secondary}>Recent transcriptions</Text>
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
        {!recentLoading && !recentError && recentItems.length === 0 && (
          <Box marginTop={1}>
            <Text color={colors.secondary}>No recent transcriptions.</Text>
          </Box>
        )}
        {!recentLoading && !recentError && recentItems.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            {recentItems.map((item, index) => {
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
    </Box>
  );
}

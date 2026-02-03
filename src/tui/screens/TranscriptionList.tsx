import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { promises as fs } from "fs";
import path from "path";
import { useApi } from "../hooks/useApi";
import { usePagination } from "../hooks/usePagination";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { fuzzyMatch, highlightMatch } from "../utils/fuzzyMatch";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { pickValueOrDash } from "../../lib/utils";
import { formatDurationCompact } from "../../lib/output";
import { openUrl } from "../utils/openUrl";
import { buildMarkdownFromAnalysis } from "../utils/markdown";
import { formatTimeAgo } from "../utils/time";
import { parseMarkdownStructure, renderMarkdownWindow } from "../utils/renderMarkdown";
import { SplitLayout } from "../components/SplitLayout";
import type { NavigationState } from "../hooks/useNavigation";
import { useLayout } from "../context/LayoutContext";
import { useInputLock } from "../context/InputContext";
import { parseResponse } from "../../lib/parseResponse";
import { TranscriptionListResponseSchema, AnalysisResponseSchema } from "../../lib/schemas";

interface ListParams {
  status?: string;
  sort?: string;
}

interface TerminalSize {
  columns: number;
  rows: number;
}

interface TranscriptionListProps {
  params?: ListParams;
  navigation: Pick<NavigationState, "push">;
  onBack: () => void;
  terminal: TerminalSize;
}

type RawItem = Record<string, unknown>;

function normalizeListResponse(data: Record<string, unknown>) {
  const items =
    (data.list as RawItem[] | undefined) ??
    (data.data as RawItem[] | undefined) ??
    (data.transcriptions as RawItem[] | undefined) ??
    (data.items as RawItem[] | undefined) ??
    (data.results as RawItem[] | undefined) ??
    [];

  const pagination =
    (data.pagination as Record<string, unknown> | undefined) ??
    (data.meta as Record<string, unknown> | undefined) ??
    {};

  const page =
    (data.page as number | undefined) ??
    (pagination.page as number | undefined) ??
    1;
  const limit =
    (data.limit as number | undefined) ??
    (pagination.limit as number | undefined) ??
    items.length;
  const total =
    (data.total as number | undefined) ??
    (pagination.total as number | undefined) ??
    items.length;
  const totalPages =
    (data.totalPages as number | undefined) ??
    (pagination.totalPages as number | undefined) ??
    (limit ? Math.ceil(total / limit) : 1);

  return { items, page, limit, total, totalPages };
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

export function TranscriptionList({
  params,
  navigation,
  onBack,
  terminal,
}: TranscriptionListProps): JSX.Element {
  const { setFooterHints, setFooterStatus } = useLayout();
  const { setInputActive } = useInputLock();
  const [status] = useState<string | undefined>(params?.status);
  const [sort] = useState<string | undefined>(params?.sort);
  const [searchActive, setSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  // Preview panel state for wide mode
  const [previewData, setPreviewData] = useState<{ title: string; summary: string; status: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewCacheRef = useRef<Map<string, { title: string; summary: string; status: string }>>(new Map());
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const searchQuery = searchValue.trim();

  const { page, limit, total, totalPages, setPagination, nextPage, prevPage } = usePagination(1, 20);
  const prevDataRef = useRef<Record<string, unknown> | null>(null);
  const lastPageRef = useRef(page);

  const { data: rawData, loading, error, refresh } = useApi<Record<string, unknown>>(
    "/v1/transcriptions",
    {
      query: { page, limit, status, sort, q: searchQuery || undefined },
    },
    [page, limit, status, sort, searchQuery],
  );

  // Validate + keep previous data visible while loading new page (prevents flash/blank)
  const validatedData = rawData ? parseResponse(TranscriptionListResponseSchema, rawData, "transcription-list") : null;
  const data = validatedData ?? prevDataRef.current;
  useEffect(() => {
    if (validatedData) prevDataRef.current = validatedData;
  }, [validatedData]);

  // Reset cursor to top on page change
  useEffect(() => {
    if (page !== lastPageRef.current) {
      setSelectedIndex(0);
      lastPageRef.current = page;
    }
  }, [page]);

  // Read config limit once on mount only
  const configLimitLoaded = useRef(false);
  useEffect(() => {
    if (configLimitLoaded.current) return;
    configLimitLoaded.current = true;
    void (async () => {
      const config = await readConfig();
      const defaultLimit = config?.default?.limit;
      if (typeof defaultLimit === "number" && defaultLimit > 0 && defaultLimit !== 20) {
        setPagination({ limit: defaultLimit, page: 1 });
      }
    })();
  }, [setPagination]);

  // Auto-refresh removed — users can press `r` to refresh

  // Lock global input when search is active
  useEffect(() => {
    setInputActive(searchActive);
    return () => setInputActive(false);
  }, [searchActive, setInputActive]);

  useEffect(() => {
    if (!searchActive) return;
    const timer = setTimeout(() => {
      setSearchValue(searchDraft);
      setPagination({ page: 1 });
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [searchActive, searchDraft, setPagination]);

  const isWide = terminal.columns >= 120;

  const normalized = useMemo(() => normalizeListResponse(data ?? {}), [data]);

  // Only update metadata from API response — never feed page/limit back (causes loops)
  useEffect(() => {
    setPagination({
      total: normalized.total,
      totalPages: normalized.totalPages,
    });
  }, [normalized.total, normalized.totalPages, setPagination]);

  const listItems = useMemo(() => {
    const items = normalized.items.map((item) => {
      const durationRaw =
        (item.duration as number | string | undefined) ??
        (item.durationSec as number | undefined) ??
        (item.durationSeconds as number | undefined) ??
        (item.lengthSec as number | undefined);

      return {
        id: pickValueOrDash(item, ["id", "transcriptionId", "_id"]),
        title: pickValueOrDash(item, ["title", "videoTitle", "name"]),
        channel: pickValueOrDash(item, ["channel", "channelTitle", "author"]),
        status: pickValueOrDash(item, ["status", "state"]),
        duration: formatDurationCompact(durationRaw ?? "—"),
        created: formatTimeAgo(item.createdAt as string | undefined),
      };
    });

    // Filter out optimistically deleted items
    const filteredItems = deletedIds.length > 0
      ? items.filter((item) => !deletedIds.includes(item.id))
      : items;

    // Client-side fuzzy filtering when search is active
    if (!searchQuery) return filteredItems.map((item) => ({ ...item, titleHighlighted: item.title, fuzzyScore: 0, titleIndices: [] as number[] }));

    return filteredItems
      .map((item) => {
        const titleResult = fuzzyMatch(searchQuery, item.title);
        const channelResult = fuzzyMatch(searchQuery, item.channel);
        const bestMatch = titleResult.score >= channelResult.score ? titleResult : channelResult;
        const matched = titleResult.match || channelResult.match;
        return {
          ...item,
          titleHighlighted: titleResult.match ? highlightMatch(item.title, titleResult.indices) : item.title,
          titleIndices: titleResult.match ? titleResult.indices : [],
          fuzzyScore: bestMatch.score,
          matched,
        };
      })
      .filter((item) => item.matched)
      .sort((a, b) => b.fuzzyScore - a.fuzzyScore);
  }, [normalized.items, searchQuery, deletedIds]);

  useEffect(() => {
    if (selectedIndex >= listItems.length) {
      setSelectedIndex(Math.max(0, listItems.length - 1));
    }
  }, [listItems.length, selectedIndex]);

  const selectedItem = listItems[selectedIndex];
  const selectedIdsSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedCount = selectedIds.length;

  // Debounced preview fetch for wide mode with AbortController
  useEffect(() => {
    if (!isWide || !selectedItem) {
      setPreviewData(null);
      return;
    }

    // Check cache first
    const cached = previewCacheRef.current.get(selectedItem.id);
    if (cached) {
      setPreviewData(cached);
      return;
    }

    // Abort previous in-flight request
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;

    setPreviewLoading(true);
    previewTimerRef.current = setTimeout(() => {
      void (async () => {
        try {
          const config = (await readConfig()) ?? {};
          const { token } = resolveToken(config);
          if (!token) { setPreviewLoading(false); return; }
          const apiUrl = resolveApiUrl(config);
          const rawResponse = (await apiFetch(`/v1/analysis/${selectedItem.id}`, {
            token,
            apiUrl,
            signal: controller.signal,
          })) as Record<string, unknown>;
          if (controller.signal.aborted) return;
          const response = parseResponse(AnalysisResponseSchema, rawResponse, "analysis-preview");
          const analysis = unwrapAnalysis(response);
          const preview = {
            title: pickValueOrDash(analysis ?? {}, ["title", "videoTitle", "name"]),
            summary: ((analysis?.cleanContent as string) ?? (analysis?.content as string) ?? (analysis?.transcript as string) ?? "").slice(0, 500),
            status: pickValueOrDash(analysis ?? {}, ["status", "state"]),
          };
          previewCacheRef.current.set(selectedItem.id, preview);
          if (!controller.signal.aborted) {
            setPreviewData(preview);
          }
        } catch (err) {
          if ((err as Error).name === "AbortError") return;
          setPreviewData(null);
        } finally {
          if (!controller.signal.aborted) {
            setPreviewLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      controller.abort();
    };
  }, [isWide, selectedItem?.id]);

  const reservedRows =
    6 +
    (searchActive ? 2 : searchValue ? 1 : 0) +
    (confirmDelete || confirmBatchDelete ? 1 : 0) +
    (isDeleting || isBatchDeleting || isBatchExporting ? 1 : 0) +
    (notice ? 1 : 0) +
    (error ? 1 : 0) +
    (loading && !data ? 1 : 0);
  const itemHeight = 3;
  const listHeight = Math.max(1, terminal.rows - reservedRows);
  const itemsPerPage = Math.max(1, Math.floor(listHeight / itemHeight));
  const maxStart = Math.max(0, listItems.length - itemsPerPage);
  const windowStart = Math.min(
    Math.max(0, selectedIndex - Math.floor(itemsPerPage / 2)),
    maxStart,
  );
  const visibleItems = listItems.slice(windowStart, windowStart + itemsPerPage);

  useEffect(() => {
    if (confirmBatchDelete || confirmDelete) {
      setFooterHints([
        { key: "y/n", description: "confirm" },
        { key: "Esc", description: "cancel" },
      ]);
    } else if (searchActive) {
      setFooterHints([
        { key: "Esc", description: "cancel" },
        { key: "Enter", description: "apply" },
      ]);
    } else {
      const hints: Hint[] = [
        { key: "↑/↓", description: "move" },
        { key: "Enter", description: "view" },
        { key: "Space", description: "select" },
      ];
      if (selectedCount > 0) {
        hints.push({ key: "D", description: "delete sel." });
        hints.push({ key: "E", description: "export sel." });
        hints.push({ key: "x", description: "clear sel." });
      }
      if (totalPages > 1) {
        hints.push({ key: "n/p", description: "page" });
      }
      hints.push({ key: "/", description: "search" });
      hints.push({ key: "r", description: "refresh" });
      setFooterHints(hints);
    }

    setFooterStatus(selectedCount > 0 ? `${selectedCount} selected` : undefined);
  }, [confirmBatchDelete, confirmDelete, searchActive, selectedCount, setFooterHints, setFooterStatus]);

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;
    const itemId = selectedItem.id;
    // Optimistic: remove from view immediately
    setDeletedIds((prev) => [...prev, itemId]);
    setNotice(`Deleted ${itemId}`);
    setIsDeleting(true);
    try {
      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        // Revert optimistic delete
        setDeletedIds((prev) => prev.filter((id) => id !== itemId));
        setNotice(
          expired
            ? "Token expired. Run `xevol login` to re-authenticate."
            : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
        );
        return;
      }
      const apiUrl = resolveApiUrl(config);
      await apiFetch(`/v1/transcriptions/${itemId}`, {
        method: "DELETE",
        token,
        apiUrl,
      });
      // Refresh to sync server state (deletedIds will be cleared on new data)
      await refresh();
      setDeletedIds((prev) => prev.filter((id) => id !== itemId));
    } catch (err) {
      // Revert optimistic delete on failure
      setDeletedIds((prev) => prev.filter((id) => id !== itemId));
      setNotice((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedItem, refresh]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) {
      setNotice("No transcriptions selected.");
      return;
    }
    const idsToDelete = [...selectedIds];
    // Optimistic: remove all selected from view immediately
    setDeletedIds((prev) => [...prev, ...idsToDelete]);
    setNotice(`Deleted ${idsToDelete.length} transcriptions`);
    setSelectedIds([]);
    setIsBatchDeleting(true);
    try {
      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        // Revert optimistic delete
        setDeletedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
        setSelectedIds(idsToDelete);
        setNotice(
          expired
            ? "Token expired. Run `xevol login` to re-authenticate."
            : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
        );
        return;
      }
      const apiUrl = resolveApiUrl(config);
      for (const id of idsToDelete) {
        await apiFetch(`/v1/transcriptions/${id}`, {
          method: "DELETE",
          token,
          apiUrl,
        });
      }
      await refresh();
      setDeletedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
    } catch (err) {
      // Revert optimistic delete on failure
      setDeletedIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      setNotice((err as Error).message);
    } finally {
      setIsBatchDeleting(false);
    }
  }, [refresh, selectedIds]);

  const handleBatchExport = useCallback(async () => {
    if (selectedIds.length === 0) {
      setNotice("No transcriptions selected.");
      return;
    }
    setIsBatchExporting(true);
    setNotice(null);
    try {
      const config = (await readConfig()) ?? {};
      const { token, expired } = resolveToken(config);
      if (!token) {
        setNotice(
          expired
            ? "Token expired. Run `xevol login` to re-authenticate."
            : "Not logged in. Use xevol login --token <token> or set XEVOL_TOKEN.",
        );
        return;
      }
      const apiUrl = resolveApiUrl(config);
      let exportedCount = 0;
      for (const id of selectedIds) {
        const rawResponse = (await apiFetch(`/v1/analysis/${id}`, {
          token,
          apiUrl,
        })) as Record<string, unknown>;
        const response = parseResponse(AnalysisResponseSchema, rawResponse, "analysis-export");
        const analysis = unwrapAnalysis(response);
        if (!analysis) continue;
        const output = buildMarkdownFromAnalysis(analysis);
        if (!output.trim()) continue;
        const filename = `xevol-${id}.md`;
        const filePath = path.join(process.cwd(), filename);
        await fs.writeFile(filePath, output, "utf8");
        exportedCount += 1;
      }
      setNotice(`Exported ${exportedCount} transcription${exportedCount === 1 ? "" : "s"}`);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setIsBatchExporting(false);
    }
  }, [selectedIds]);

  const handleOpen = useCallback(() => {
    if (!selectedItem) return;
    const url = `https://xevol.com/t/${encodeURIComponent(selectedItem.id)}`;
    openUrl(url);
    setNotice(`Opened ${selectedItem.id} in browser`);
  }, [selectedItem]);

  useInput((input, key) => {
    const lower = input.toLowerCase();

    if (confirmBatchDelete) {
      if (lower === "y") {
        setConfirmBatchDelete(false);
        void handleBatchDelete();
      }
      if (lower === "n" || key.escape) {
        setConfirmBatchDelete(false);
        setNotice("Batch delete canceled");
      }
      return;
    }

    if (confirmDelete) {
      if (lower === "y") {
        setConfirmDelete(false);
        void handleDelete();
      }
      if (lower === "n" || key.escape) {
        setConfirmDelete(false);
        setNotice("Delete canceled");
      }
      return;
    }

    if (searchActive) {
      if (key.escape) {
        setSearchDraft("");
        setSearchValue("");
        setSearchActive(false);
        setPagination({ page: 1 });
      }
      return;
    }

    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if ((key.upArrow || lower === "k") && listItems.length > 0) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if ((key.downArrow || lower === "j") && listItems.length > 0) {
      setSelectedIndex((prev) => Math.min(listItems.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      if (selectedItem) {
        navigation.push("detail", { id: selectedItem.id });
      }
      return;
    }

    if (input === "D") {
      if (selectedCount > 0) {
        setConfirmBatchDelete(true);
      } else {
        setNotice("No transcriptions selected.");
      }
      return;
    }

    if (input === "E") {
      void handleBatchExport();
      return;
    }

    if (input === " ") {
      if (selectedItem) {
        setSelectedIds((prev) =>
          prev.includes(selectedItem.id)
            ? prev.filter((id) => id !== selectedItem.id)
            : [...prev, selectedItem.id],
        );
      }
      return;
    }

    if (lower === "x") {
      setSelectedIds([]);
      return;
    }

    if (lower === "n") {
      nextPage();
      return;
    }

    if (lower === "p") {
      prevPage();
      return;
    }

    if (input === "/") {
      setSearchDraft(searchValue);
      setSearchActive(true);
      return;
    }

    if (lower === "d") {
      if (selectedItem) {
        setConfirmDelete(true);
      }
      return;
    }

    if (lower === "o") {
      handleOpen();
      return;
    }

    if (input === "g") {
      setSelectedIndex(0);
      return;
    }

    if (input === "G") {
      setSelectedIndex(Math.max(0, listItems.length - 1));
      return;
    }

    if (lower === "r") {
      void refresh();
    }
  });

  const listPanel = (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {searchActive && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={colors.secondary}>/ </Text>
            <TextInput
              value={searchDraft}
              onChange={setSearchDraft}
              onSubmit={() => {
                setSearchValue(searchDraft);
                setSearchActive(false);
                setPagination({ page: 1 });
              }}
            />
          </Box>
          <Text color={colors.secondary}>Searching: {searchDraft || "…"}</Text>
        </Box>
      )}

      {!searchActive && searchValue && (
        <Box marginBottom={1}>
          <Text color={colors.secondary}>Filter: {searchValue}</Text>
        </Box>
      )}

      {loading && !data && <Spinner label="Fetching transcriptions…" />}
      {error && (
        <Text color={colors.error}>
          {error} (press r to retry)
        </Text>
      )}

      {!loading && !error && listItems.length === 0 && !prevDataRef.current && (
        <Text color={colors.secondary}>No transcriptions found.</Text>
      )}

      {listItems.length > 0 && (
        <Box flexDirection="column">
          {visibleItems.map((item, index) => {
            const absoluteIndex = windowStart + index;
            const isSelected = absoluteIndex === selectedIndex;
            const isChecked = selectedIdsSet.has(item.id);
            return (
              <Box key={item.id} flexDirection="row" marginBottom={1}>
                <Box width={2}>
                  <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
                </Box>
                <Box width={3}>
                  <Text color={isChecked ? colors.primary : colors.secondary}>
                    {isChecked ? "☑" : "☐"}
                  </Text>
                </Box>
                <Box flexDirection="column" flexGrow={1}>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text color={isSelected ? colors.primary : undefined}>{searchQuery && item.titleIndices.length > 0 ? item.titleHighlighted : item.title}</Text>
                    <Text color={colors.secondary}>{item.created}</Text>
                  </Box>
                  <Box flexDirection="row">
                    <StatusBadge status={item.status} />
                    <Text color={colors.secondary}> {item.status}</Text>
                    <Text color={colors.secondary}> · {item.duration}</Text>
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {confirmBatchDelete && (
        <Box marginTop={1}>
          <Text color={colors.warning}>Delete {selectedCount} selected transcriptions? (y/n)</Text>
        </Box>
      )}

      {confirmDelete && (
        <Box marginTop={1}>
          <Text color={colors.warning}>Delete {selectedItem?.title}? (y/n)</Text>
        </Box>
      )}

      {isDeleting && (
        <Box marginTop={1}>
          <Spinner label="Deleting transcription…" />
        </Box>
      )}

      {isBatchDeleting && (
        <Box marginTop={1}>
          <Spinner label="Deleting selected…" />
        </Box>
      )}

      {isBatchExporting && (
        <Box marginTop={1}>
          <Spinner label="Exporting selected…" />
        </Box>
      )}

      {notice && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>{notice}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={colors.secondary}>
          Page {page} / {totalPages} · {total} total
        </Text>
      </Box>
    </Box>
  );

  // Preview panel for wide mode
  const previewWidth = Math.floor(terminal.columns * 0.6) - 2;
  const previewPanel = (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {previewLoading && <Spinner label="Loading preview…" />}
      {!previewLoading && previewData && (
        <Box flexDirection="column">
          <Text bold color={colors.primary}>{previewData.title}</Text>
          <Box marginTop={1} flexDirection="row">
            <StatusBadge status={previewData.status} />
            <Text color={colors.secondary}> {previewData.status}</Text>
          </Box>
          {previewData.summary ? (
            <Box marginTop={1} flexDirection="column">
              <Text>{renderMarkdownWindow(parseMarkdownStructure(previewData.summary, previewWidth), 0, Math.max(4, terminal.rows - 10)).join("\n")}</Text>
            </Box>
          ) : null}
        </Box>
      )}
      {!previewLoading && !previewData && (
        <Text color={colors.secondary}>Select a transcription to preview</Text>
      )}
    </Box>
  );

  if (isWide) {
    return (
      <SplitLayout
        left={listPanel}
        right={previewPanel}
        terminal={terminal}
      />
    );
  }

  return listPanel;
}

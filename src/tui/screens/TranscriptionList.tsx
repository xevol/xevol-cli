import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useApi } from "../hooks/useApi";
import { usePagination } from "../hooks/usePagination";
import { StatusBadge } from "../components/StatusBadge";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../../lib/config";
import { pickValueOrDash } from "../../lib/utils";
import { formatDurationCompact } from "../../lib/output";
import { openUrl } from "../utils/openUrl";
import type { NavigationState } from "../hooks/useNavigation";

interface ListParams {
  status?: string;
  sort?: string;
}

interface TranscriptionListProps {
  params?: ListParams;
  navigation: Pick<NavigationState, "push">;
  onBack: () => void;
}

type RawItem = Record<string, unknown>;

function formatCreatedAt(raw: string | undefined): string {
  if (!raw) return "—";
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    if (d.getFullYear() === now.getFullYear()) {
      return `${month}-${day}`;
    }
    return `${d.getFullYear()}-${month}-${day}`;
  } catch {
    return "—";
  }
}

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

export function TranscriptionList({ params, navigation, onBack }: TranscriptionListProps): JSX.Element {
  const [status] = useState<string | undefined>(params?.status);
  const [sort] = useState<string | undefined>(params?.sort);
  const [searchActive, setSearchActive] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { page, limit, total, totalPages, setPagination, nextPage, prevPage } = usePagination(1, 20);

  const { data, loading, error, refresh } = useApi<Record<string, unknown>>(
    "/v1/transcriptions",
    {
      query: { page, limit, status, sort },
    },
    [page, limit, status, sort],
  );

  const normalized = useMemo(() => normalizeListResponse(data ?? {}), [data]);

  useEffect(() => {
    setPagination({
      page: normalized.page,
      limit: normalized.limit,
      total: normalized.total,
      totalPages: normalized.totalPages,
    });
  }, [normalized, setPagination]);

  const listItems = useMemo(() => {
    return normalized.items.map((item) => {
      const durationRaw =
        (item.duration as number | string | undefined) ??
        (item.durationSec as number | undefined) ??
        (item.durationSeconds as number | undefined) ??
        (item.lengthSec as number | undefined);

      return {
        id: pickValueOrDash(item, ["id", "transcriptionId", "_id"]),
        title: pickValueOrDash(item, ["title", "videoTitle", "name"]),
        status: pickValueOrDash(item, ["status", "state"]),
        duration: formatDurationCompact(durationRaw ?? "—"),
        created: formatCreatedAt(item.createdAt as string | undefined),
      };
    });
  }, [normalized.items]);

  const activeSearchValue = searchActive ? searchDraft : searchValue;
  const filteredItems = useMemo(() => {
    if (!activeSearchValue) return listItems;
    const needle = activeSearchValue.toLowerCase();
    return listItems.filter((item) => item.title.toLowerCase().includes(needle));
  }, [activeSearchValue, listItems]);

  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1));
    }
  }, [filteredItems.length, selectedIndex]);

  const selectedItem = filteredItems[selectedIndex];

  const handleDelete = useCallback(async () => {
    if (!selectedItem) return;
    setIsDeleting(true);
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
      await apiFetch(`/v1/transcriptions/${selectedItem.id}`, {
        method: "DELETE",
        token,
        apiUrl,
      });
      setNotice(`Deleted ${selectedItem.id}`);
      await refresh();
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  }, [selectedItem, refresh]);

  const handleOpen = useCallback(() => {
    if (!selectedItem) return;
    const url = `https://xevol.com/t/${encodeURIComponent(selectedItem.id)}`;
    openUrl(url);
    setNotice(`Opened ${selectedItem.id} in browser`);
  }, [selectedItem]);

  useInput((input, key) => {
    const lower = input.toLowerCase();
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
        setSearchDraft(searchValue);
        setSearchActive(false);
      }
      return;
    }

    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if (key.upArrow && filteredItems.length > 0) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow && filteredItems.length > 0) {
      setSelectedIndex((prev) => Math.min(filteredItems.length - 1, prev + 1));
      return;
    }

    if (key.return) {
      if (selectedItem) {
        navigation.push("detail", { id: selectedItem.id });
      }
      return;
    }

    if (lower === "n") {
      if (page < totalPages) nextPage();
      return;
    }

    if (lower === "p") {
      if (page > 1) prevPage();
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

    if (lower === "r") {
      void refresh();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {loading && <Spinner label="Fetching transcriptions…" />}
      {error && <Text color={colors.error}>{error}</Text>}

      {!loading && !error && filteredItems.length === 0 && (
        <Text color={colors.secondary}>No transcriptions found.</Text>
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <Box flexDirection="column">
          {filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box key={item.id} flexDirection="row" marginBottom={1}>
                <Box width={2}>
                  <Text color={isSelected ? colors.primary : colors.secondary}>{isSelected ? "›" : " "}</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1}>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text color={isSelected ? colors.primary : undefined}>{item.title}</Text>
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

      {searchActive && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>/ </Text>
          <TextInput
            value={searchDraft}
            onChange={setSearchDraft}
            onSubmit={() => {
              setSearchValue(searchDraft);
              setSearchActive(false);
            }}
          />
        </Box>
      )}

      {!searchActive && searchValue && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>Filter: {searchValue}</Text>
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
}

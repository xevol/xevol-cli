import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import { readConfig, updateConfig } from "../../lib/config";
import type { Hint } from "../components/Footer";

interface WorkspacesProps {
  onBack: () => void;
  setFooterHints: (hints: Hint[]) => void;
}

type RawItem = Record<string, unknown>;

function normalizeWorkspaceResponse(data: Record<string, unknown>): RawItem[] {
  return (
    (data.workspaces as RawItem[] | undefined) ??
    (data.data as RawItem[] | undefined) ??
    (data.list as RawItem[] | undefined) ??
    (data.items as RawItem[] | undefined) ??
    (data.results as RawItem[] | undefined) ??
    []
  );
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function extractId(item: RawItem): string | undefined {
  return (
    toStringValue(item.id) ??
    toStringValue(item.workspaceId) ??
    toStringValue(item._id) ??
    toStringValue(item.slug)
  );
}

function extractName(item: RawItem): string {
  return (
    toStringValue(item.name) ??
    toStringValue(item.title) ??
    toStringValue(item.workspaceName) ??
    "-"
  );
}

function extractRole(item: RawItem): string {
  return (
    toStringValue(item.role) ??
    toStringValue(item.userRole) ??
    toStringValue(item.memberRole) ??
    toStringValue(item.permission) ??
    "-"
  );
}

interface WorkspaceEntry {
  id: string;
  name: string;
  role: string;
}

export function Workspaces({ onBack, setFooterHints }: WorkspacesProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  // Load current active workspace from config
  useEffect(() => {
    void (async () => {
      const config = (await readConfig()) ?? {};
      setActiveId(config.workspaceId as string | undefined);
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { data: rawData, loading, error } = useApi<Record<string, unknown>>("/v1/workspaces", {}, []);

  const workspaces: WorkspaceEntry[] = useMemo(() => {
    if (!rawData) return [];
    const items = normalizeWorkspaceResponse(rawData);
    return items
      .map((item) => {
        const id = extractId(item);
        if (!id) return null;
        return {
          id,
          name: extractName(item),
          role: extractRole(item),
        };
      })
      .filter((w): w is WorkspaceEntry => w !== null);
  }, [rawData]);

  useEffect(() => {
    if (selectedIndex >= workspaces.length && workspaces.length > 0) {
      setSelectedIndex(Math.max(0, workspaces.length - 1));
    }
  }, [selectedIndex, workspaces.length]);

  useEffect(() => {
    setFooterHints([
      { key: "↑/↓", description: "move" },
      { key: "Enter", description: "switch" },
      { key: "Esc", description: "back" },
    ]);
  }, [setFooterHints]);

  useInput((input, key) => {
    if (key.escape || key.backspace) {
      onBack();
      return;
    }

    if ((key.upArrow || input === "k") && workspaces.length > 0) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if ((key.downArrow || input === "j") && workspaces.length > 0) {
      setSelectedIndex((prev) => Math.min(workspaces.length - 1, prev + 1));
      return;
    }

    if (input === "g") {
      setSelectedIndex(0);
      return;
    }

    if (input === "G") {
      setSelectedIndex(Math.max(0, workspaces.length - 1));
      return;
    }

    if (key.return && workspaces[selectedIndex]) {
      const ws = workspaces[selectedIndex];
      void (async () => {
        try {
          await updateConfig({ workspaceId: ws.id });
          setActiveId(ws.id);
          setNotice(`Switched to ${ws.name}`);
        } catch (err) {
          setNotice((err as Error).message);
        }
      })();
      return;
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color={colors.primary}>Workspaces</Text>

      {loading && (
        <Box marginTop={1}>
          <Spinner label="Fetching workspaces…" />
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color={colors.error}>{error}</Text>
        </Box>
      )}

      {!loading && !error && workspaces.length === 0 && (
        <Box marginTop={1}>
          <Text color={colors.secondary}>No workspaces found.</Text>
        </Box>
      )}

      {workspaces.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {workspaces.map((ws, index) => {
            const isSelected = index === selectedIndex;
            const isActive = ws.id === activeId;
            return (
              <Box key={ws.id} flexDirection="row" marginBottom={0}>
                <Box width={2}>
                  <Text color={isSelected ? colors.primary : colors.secondary}>
                    {isSelected ? "›" : " "}
                  </Text>
                </Box>
                <Box flexDirection="row" flexGrow={1}>
                  <Text color={isSelected ? colors.primary : undefined}>
                    {ws.name}
                  </Text>
                  {isActive && (
                    <Text color={colors.primary}> ●</Text>
                  )}
                  <Text color={colors.secondary}> · {ws.role}</Text>
                </Box>
              </Box>
            );
          })}
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

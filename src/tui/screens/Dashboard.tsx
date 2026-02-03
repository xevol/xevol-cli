import React, { useMemo, useState } from "react";
import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import { useApi } from "../hooks/useApi";
import { Spinner } from "../components/Spinner";
import { colors } from "../theme";
import type { NavigationState } from "../hooks/useNavigation";

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

type MenuValue = "transcriptions" | "usage" | "workspaces" | "settings" | "help" | "quit";

const MENU_ITEMS: Array<{ label: string; value: MenuValue }> = [
  { label: "📋 Transcriptions", value: "transcriptions" },
  { label: "📊 Usage", value: "usage" },
  { label: "🏢 Workspaces", value: "workspaces" },
  { label: "⚙️  Settings", value: "settings" },
  { label: "❓ Help", value: "help" },
  { label: "🚪 Quit", value: "quit" },
];

function buildUsageLines(data: Record<string, unknown>): string[] {
  const usage = (data.usage as Record<string, number>) ?? {};
  const limits = (data.limits as Record<string, number>) ?? {};
  const period = (data.period as string) ?? "month";
  const periodEnd = data.current_period_end as string | null | undefined;

  const transcriptions = usage.transcriptions ?? 0;
  const limit = limits.transcriptions ?? "∞";

  const lines = [`Usage: ${transcriptions} / ${limit} transcriptions (this ${period})`];

  if (periodEnd) {
    const endDate = new Date(periodEnd);
    if (!Number.isNaN(endDate.getTime())) {
      const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / 86400000));
      lines.push(`Renews: ${endDate.toLocaleDateString()} (${daysLeft} days)`);
    }
  }

  return lines;
}

export function Dashboard({ version, navigation }: DashboardProps): JSX.Element {
  const { exit } = useApp();
  const [showUsage, setShowUsage] = useState(false);

  const { data, loading, error } = useApi<Record<string, unknown>>("/auth/cli/status");

  const accountLine = useMemo(() => {
    if (!data) return "";
    const email =
      (data.email as string | undefined) ??
      (data.user as Record<string, unknown> | undefined)?.email?.toString();
    const plan = (data.plan as string | undefined) ?? "";

    const parts: string[] = [];
    if (email) parts.push(email);
    if (plan) parts.push(`${plan} plan`);

    return parts.join(" · ");
  }, [data]);

  const usageLines = useMemo(() => (data ? buildUsageLines(data) : []), [data]);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" marginBottom={1}>
        {LOGO_LINES.map((line) => (
          <Text key={line} color={colors.primary}>
            {line}
          </Text>
        ))}
        <Box marginTop={1}>
          <Text color={colors.secondary}>v{version}</Text>
        </Box>
        {accountLine ? (
          <Box marginTop={1}>
            <Text color={colors.secondary}>{accountLine}</Text>
          </Box>
        ) : null}
      </Box>

      {loading && (
        <Box marginBottom={1}>
          <Spinner label="Loading account…" />
        </Box>
      )}
      {error && (
        <Box marginBottom={1}>
          <Text color={colors.error}>{error}</Text>
        </Box>
      )}

      <SelectInput
        items={MENU_ITEMS}
        onSelect={(item) => {
          if (item.value === "transcriptions") {
            setShowUsage(false);
            navigation.push("list");
            return;
          }
          if (item.value === "usage") {
            setShowUsage(true);
            return;
          }
          if (item.value === "workspaces") {
            setShowUsage(false);
            navigation.push("workspaces");
            return;
          }
          if (item.value === "settings") {
            setShowUsage(false);
            navigation.push("settings");
            return;
          }
          if (item.value === "help") {
            setShowUsage(false);
            navigation.push("help");
            return;
          }
          if (item.value === "quit") {
            exit();
          }
        }}
      />

      {showUsage && (
        <Box flexDirection="column" marginTop={1}>
          {loading ? (
            <Spinner label="Loading usage…" />
          ) : data ? (
            usageLines.map((line) => (
              <Text key={line} color={colors.secondary}>
                {line}
              </Text>
            ))
          ) : (
            <Text color={colors.secondary}>Usage unavailable.</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

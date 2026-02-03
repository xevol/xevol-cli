import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

interface StatsBarProps {
  total?: number;
  used?: number;
  limit?: number;
  workspace?: string;
}

export function StatsBar({ total, used, limit, workspace }: StatsBarProps): JSX.Element {
  const parts: string[] = [];

  if (total !== undefined) {
    parts.push(`${total} transcription${total === 1 ? "" : "s"}`);
  }

  if (used !== undefined && limit !== undefined) {
    parts.push(`${used}/${limit} this month`);
  } else if (used !== undefined) {
    parts.push(`${used} used this month`);
  }

  if (workspace) {
    parts.push(workspace);
  }

  if (parts.length === 0) return <Box />;

  return (
    <Box paddingX={1} paddingY={0}>
      <Text color={colors.secondary}>{parts.join(" · ")}</Text>
    </Box>
  );
}

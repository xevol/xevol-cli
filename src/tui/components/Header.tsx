import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";
import type { ScreenName } from "../hooks/useNavigation";

const SCREEN_LABELS: Record<ScreenName, string> = {
  dashboard: "Dashboard",
  list: "Transcriptions",
  detail: "Transcription",
  "spike-viewer": "Spikes",
  help: "Help",
  workspaces: "Workspaces",
  settings: "Settings",
};

interface HeaderProps {
  version: string;
  screen: ScreenName;
}

export function Header({ version, screen }: HeaderProps): JSX.Element {
  return (
    <Box paddingX={1} paddingY={0} justifyContent="space-between">
      <Text color={colors.primary}>
        xevol v{version}
      </Text>
      <Text color={colors.secondary}>{SCREEN_LABELS[screen]}</Text>
    </Box>
  );
}

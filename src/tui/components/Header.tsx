import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";
import type { ScreenName } from "../hooks/useNavigation";

const SCREEN_LABELS: Record<ScreenName, string> = {
  dashboard: "Dashboard",
  list: "Transcriptions",
  detail: "Transcription",
  "spike-viewer": "Spikes",
  "add-url": "Add URL",
  help: "Help",
  workspaces: "Workspaces",
  settings: "Settings",
};

interface HeaderProps {
  version: string;
  screen: ScreenName;
  email?: string;
  plan?: string;
}

export function Header({ version, screen, email, plan }: HeaderProps): JSX.Element {
  const userInfo = [email, plan].filter(Boolean).join(" · ");
  const screenLabel = SCREEN_LABELS[screen] ?? screen;
  return (
    <Box paddingX={1} paddingY={0} justifyContent="space-between">
      <Text color={colors.primary}>
        xevol v{version} · {screenLabel.toLowerCase()}
      </Text>
      {userInfo ? (
        <Text color={colors.secondary}>{userInfo}</Text>
      ) : null}
    </Box>
  );
}

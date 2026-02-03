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
  email?: string;
  plan?: string;
}

export function Header({ version, screen, email, plan }: HeaderProps): JSX.Element {
  const userInfo = [email, plan].filter(Boolean).join(" · ");
  return (
    <Box paddingX={1} paddingY={0} justifyContent="space-between">
      <Text color={colors.primary}>
        xevol v{version}
      </Text>
      <Box>
        {userInfo ? (
          <>
            <Text color={colors.secondary}>{userInfo}</Text>
            <Text color={colors.secondary}> │ </Text>
          </>
        ) : null}
        <Text color={colors.secondary}>{SCREEN_LABELS[screen]}</Text>
      </Box>
    </Box>
  );
}

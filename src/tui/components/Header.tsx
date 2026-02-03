import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

export type ScreenName = "list" | "help";

const SCREEN_LABELS: Record<ScreenName, string> = {
  list: "Transcriptions",
  help: "Help",
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

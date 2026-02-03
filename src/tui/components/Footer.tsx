import React from "react";
import { Box, Text } from "ink";
import type { ScreenName } from "./Header";
import { colors } from "../theme";

interface FooterProps {
  screen: ScreenName;
}

function buildHints(screen: ScreenName): string {
  if (screen === "help") {
    return "? or Esc: close · q: quit";
  }
  return "↑/↓ move · Enter select · n/p page · / search · d delete · o open · r refresh · ?: help · q: quit";
}

export function Footer({ screen }: FooterProps): JSX.Element {
  return (
    <Box paddingX={1} paddingY={0}>
      <Text color={colors.secondary}>{buildHints(screen)}</Text>
    </Box>
  );
}

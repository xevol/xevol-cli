import React from "react";
import { Box, Text } from "ink";
import type { ScreenName } from "../hooks/useNavigation";
import { colors } from "../theme";

interface FooterProps {
  screen: ScreenName;
}

function buildHints(screen: ScreenName): string {
  if (screen === "dashboard") {
    return "↑/↓ move · Enter select · ?: help · q: quit";
  }
  if (screen === "detail") {
    return "↑/↓/j/k scroll · s spikes · e export · o open · Esc back · q: quit";
  }
  if (screen === "spike-viewer") {
    return "↑/↓ move · Enter view · Esc back · q: quit";
  }
  if (screen === "help") {
    return "? or Esc: close · q: quit";
  }
  if (screen === "workspaces" || screen === "settings") {
    return "Esc back · q: quit";
  }
  return "↑/↓ move · Enter select · n/p page · / search · d delete · o open · r refresh · Esc back · ?: help · q: quit";
}

export function Footer({ screen }: FooterProps): JSX.Element {
  return (
    <Box paddingX={1} paddingY={0}>
      <Text color={colors.secondary}>{buildHints(screen)}</Text>
    </Box>
  );
}

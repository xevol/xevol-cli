import React from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme";

interface HelpProps {
  onClose: () => void;
}

const KEYBINDINGS: Array<{ key: string; action: string }> = [
  { key: "↑/↓", action: "Move selection" },
  { key: "Enter", action: "Select transcription" },
  { key: "n / p", action: "Next / previous page" },
  { key: "/", action: "Search filter" },
  { key: "d", action: "Delete selected" },
  { key: "o", action: "Open in browser" },
  { key: "r", action: "Refresh list" },
  { key: "Esc / Backspace", action: "Return to dashboard" },
  { key: "?", action: "Toggle help" },
  { key: "q", action: "Quit" },
];

export function Help({ onClose }: HelpProps): JSX.Element {
  useInput((input, key) => {
    if (key.escape || key.backspace) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={colors.primary}>Keybindings</Text>
      <Box flexDirection="column" marginTop={1}>
        {KEYBINDINGS.map((item) => (
          <Box key={item.key} flexDirection="row">
            <Box width={12}>
              <Text color={colors.secondary}>{item.key}</Text>
            </Box>
            <Text>{item.action}</Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={colors.secondary}>Press ? or Esc to close.</Text>
      </Box>
    </Box>
  );
}

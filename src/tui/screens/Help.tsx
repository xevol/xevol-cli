import { Box, Text, useInput } from "ink";
import { useEffect } from "react";
import { useLayout } from "../context/LayoutContext";
import { colors } from "../theme";

interface HelpProps {
  onClose: () => void;
}

const KEYBINDINGS: Array<{ key: string; action: string; section?: string }> = [
  { key: "", action: "Dashboard", section: "dashboard" },
  { key: "↑/↓ / j/k", action: "Move selection" },
  { key: "Enter", action: "Select menu item / transcription" },
  { key: "r", action: "Refresh data" },
  { key: "", action: "Transcription List", section: "list" },
  { key: "↑/↓", action: "Move selection" },
  { key: "Enter", action: "View transcription" },
  { key: "Space", action: "Toggle selection" },
  { key: "D", action: "Batch delete selected" },
  { key: "E", action: "Batch export selected" },
  { key: "x", action: "Clear selection" },
  { key: "d", action: "Delete current" },
  { key: "n / p", action: "Next / previous page" },
  { key: "/", action: "Live search" },
  { key: "o", action: "Open in browser" },
  { key: "r", action: "Refresh list" },
  { key: "", action: "Detail / Spike Viewer", section: "detail" },
  { key: "↑/↓ / j/k", action: "Scroll content" },
  { key: "s", action: "View spikes (detail)" },
  { key: "e", action: "Export to markdown" },
  { key: "o", action: "Open in browser" },
  { key: "", action: "Global", section: "global" },
  { key: "Esc / Backspace", action: "Go back" },
  { key: "?", action: "Toggle help" },
  { key: "q", action: "Quit" },
];

export function Help({ onClose }: HelpProps): JSX.Element {
  const { setFooterHints } = useLayout();
  useEffect(() => {
    setFooterHints([
      { key: "Esc", description: "close" },
      { key: "q", description: "quit" },
    ]);
  }, [setFooterHints]);

  useInput((_input, key) => {
    if (key.escape || key.backspace) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={colors.primary}>Keybindings</Text>
      <Box flexDirection="column" marginTop={1}>
        {KEYBINDINGS.map((item, i) => {
          if (item.section) {
            return (
              <Box key={`section-${item.section}`} marginTop={i > 0 ? 1 : 0}>
                <Text color={colors.accent}>{item.action}</Text>
              </Box>
            );
          }
          return (
            <Box key={`${item.key}-${i}`} flexDirection="row">
              <Box width={16}>
                <Text color={colors.secondary}>{item.key}</Text>
              </Box>
              <Text>{item.action}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={colors.secondary}>Press ? or Esc to close.</Text>
      </Box>
    </Box>
  );
}

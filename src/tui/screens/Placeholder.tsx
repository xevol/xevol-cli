import { Box, Text, useInput } from "ink";
import { useEffect } from "react";
import type { Hint } from "../components/Footer";
import { colors } from "../theme";

interface PlaceholderProps {
  title: string;
  onBack: () => void;
  setFooterHints: (hints: Hint[]) => void;
}

export function Placeholder({ title, onBack, setFooterHints }: PlaceholderProps): JSX.Element {
  useEffect(() => {
    setFooterHints([
      { key: "Esc", description: "back" },
      { key: "q", description: "quit" },
    ]);
  }, [setFooterHints]);

  useInput((_input, key) => {
    if (key.escape || key.backspace) {
      onBack();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color={colors.primary}>{title}</Text>
      <Box marginTop={1}>
        <Text color={colors.secondary}>Coming soon.</Text>
      </Box>
    </Box>
  );
}

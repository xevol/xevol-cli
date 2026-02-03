import React from "react";
import { Box, Text, useInput } from "ink";
import { colors } from "../theme";

interface PlaceholderProps {
  title: string;
  onBack: () => void;
}

export function Placeholder({ title, onBack }: PlaceholderProps): JSX.Element {
  useInput((input, key) => {
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

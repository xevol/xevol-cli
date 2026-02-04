import { Box, Text } from "ink";
import React from "react";
import { colors } from "../theme";

export interface Hint {
  key: string;
  description: string;
}

interface FooterProps {
  hints: Hint[];
  status?: string;
}

export function Footer({ hints, status }: FooterProps): JSX.Element {
  return (
    <Box paddingX={1} paddingY={0}>
      <Text>
        {status ? <Text color={colors.secondary}>{status} · </Text> : null}
        {hints.map((hint, index) => (
          <Text key={`${hint.key}-${index}`}>
            {index > 0 && <Text color={colors.secondary}> · </Text>}
            {hint.key ? <Text color={colors.primary}>{hint.key}</Text> : null}
            {hint.description && (
              <Text color={colors.secondary}>{hint.key ? ` ${hint.description}` : hint.description}</Text>
            )}
          </Text>
        ))}
      </Text>
    </Box>
  );
}

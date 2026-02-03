import { Box } from "ink";

interface SplitLayoutProps {
  left: JSX.Element;
  right: JSX.Element;
  terminal: { columns: number; rows: number };
  splitAt?: number;
}

/**
 * Responsive two-column layout.
 * Wide mode (>= splitAt columns): left panel (40%) + right panel (60%)
 * Narrow mode (< splitAt columns): only left panel (single column)
 */
export function SplitLayout({ left, right, terminal, splitAt = 120 }: SplitLayoutProps): JSX.Element {
  const isWide = terminal.columns >= splitAt;

  if (!isWide) {
    return (
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {left}
      </Box>
    );
  }

  const leftWidth = Math.floor(terminal.columns * 0.4);
  const rightWidth = terminal.columns - leftWidth - 1; // 1 for separator

  return (
    <Box flexDirection="row" flexGrow={1} overflow="hidden">
      <Box flexDirection="column" width={leftWidth}>
        {left}
      </Box>
      <Box flexDirection="column" width={1} marginX={0}>
        {/* Separator rendered as empty space / border */}
      </Box>
      <Box flexDirection="column" width={rightWidth}>
        {right}
      </Box>
    </Box>
  );
}

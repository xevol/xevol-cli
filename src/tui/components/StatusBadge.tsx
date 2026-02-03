import { Text } from "ink";
import { colors } from "../theme";

interface StatusBadgeProps {
  status?: string | null;
}

function normalizeStatus(status?: string | null): string {
  return status?.toLowerCase() ?? "";
}

export function StatusBadge({ status }: StatusBadgeProps): JSX.Element {
  const normalized = normalizeStatus(status);
  if (normalized.includes("complete")) {
    return <Text color={colors.success}>●</Text>;
  }
  if (normalized.includes("pending") || normalized.includes("processing")) {
    return <Text color={colors.warning}>○</Text>;
  }
  if (normalized.includes("error") || normalized.includes("failed")) {
    return <Text color={colors.error}>✗</Text>;
  }
  return <Text color={colors.secondary}>•</Text>;
}

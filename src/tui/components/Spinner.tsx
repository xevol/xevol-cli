import { Text } from "ink";
import InkSpinner from "ink-spinner";
import { colors } from "../theme";

interface SpinnerProps {
  label?: string;
}

export function Spinner({ label = "Loading…" }: SpinnerProps): JSX.Element {
  return (
    <Text color={colors.primary}>
      <InkSpinner type="dots" /> {label}
    </Text>
  );
}

import { useState, useEffect, useRef } from "react";
import { useStdout } from "ink";

interface TerminalSize {
  columns: number;
  rows: number;
}

export function useTerminal(debounceMs = 100): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>({
    columns: stdout.columns ?? 80,
    rows: stdout.rows ?? 24,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setSize({
          columns: stdout.columns ?? 80,
          rows: stdout.rows ?? 24,
        });
      }, debounceMs);
    };

    stdout.on("resize", handler);
    return () => {
      stdout.off("resize", handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [stdout, debounceMs]);

  return size;
}

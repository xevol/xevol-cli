import { useState } from "react";

export type ScreenName = "list" | "help";

interface ScreenEntry {
  screen: ScreenName;
  params?: Record<string, unknown>;
}

interface NavigationState {
  currentScreen: ScreenName;
  params: Record<string, unknown>;
  push: (screen: ScreenName, params?: Record<string, unknown>) => void;
  pop: () => void;
  replace: (screen: ScreenName, params?: Record<string, unknown>) => void;
}

export function useNavigation(initialScreen: ScreenName, params?: Record<string, unknown>): NavigationState {
  const [stack, setStack] = useState<ScreenEntry[]>([{ screen: initialScreen, params }]);

  const current = stack[stack.length - 1];

  const push = (screen: ScreenName, nextParams?: Record<string, unknown>) => {
    setStack((prev) => [...prev, { screen, params: nextParams }]);
  };

  const pop = () => {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const replace = (screen: ScreenName, nextParams?: Record<string, unknown>) => {
    setStack((prev) => {
      if (prev.length === 0) return [{ screen, params: nextParams }];
      return [...prev.slice(0, -1), { screen, params: nextParams }];
    });
  };

  return {
    currentScreen: current.screen,
    params: current.params ?? {},
    push,
    pop,
    replace,
  };
}

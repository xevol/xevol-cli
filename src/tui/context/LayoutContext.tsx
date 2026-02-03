import React, { createContext, useContext, useState } from "react";
import type { Hint } from "../components/Footer";

interface LayoutContextValue {
  footerHints: Hint[];
  footerStatus: string | undefined;
  setFooterHints: (hints: Hint[]) => void;
  setFooterStatus: (status?: string) => void;
}

const LayoutContext = createContext<LayoutContextValue>({
  footerHints: [],
  footerStatus: undefined,
  setFooterHints: () => {},
  setFooterStatus: () => {},
});

export const useLayout = () => useContext(LayoutContext);

export function LayoutProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [footerHints, setFooterHints] = useState<Hint[]>([]);
  const [footerStatus, setFooterStatus] = useState<string | undefined>(undefined);
  return (
    <LayoutContext.Provider value={{ footerHints, footerStatus, setFooterHints, setFooterStatus }}>
      {children}
    </LayoutContext.Provider>
  );
}

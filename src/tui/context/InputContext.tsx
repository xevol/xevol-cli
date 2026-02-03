import React, { createContext, useContext, useState } from "react";

interface InputContextValue {
  isInputActive: boolean;
  setInputActive: (active: boolean) => void;
}

const InputContext = createContext<InputContextValue>({
  isInputActive: false,
  setInputActive: () => {},
});

export const useInputLock = () => useContext(InputContext);

export function InputProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [isInputActive, setInputActive] = useState(false);
  return (
    <InputContext.Provider value={{ isInputActive, setInputActive }}>
      {children}
    </InputContext.Provider>
  );
}

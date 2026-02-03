import React from "react";
import { Box, render, useApp, useInput } from "ink";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { useNavigation } from "./hooks/useNavigation";
import { TranscriptionList } from "./screens/TranscriptionList";
import { Help } from "./screens/Help";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps): JSX.Element {
  const { exit } = useApp();
  const { currentScreen, params, push, pop } = useNavigation("list");

  useInput((input) => {
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      if (currentScreen === "help") {
        pop();
      } else {
        push("help");
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Header version={version} screen={currentScreen} />
      <Box flexDirection="column" flexGrow={1}>
        {currentScreen === "help" ? (
          <Help onClose={pop} />
        ) : (
          <TranscriptionList params={params as { status?: string; sort?: string }} />
        )}
      </Box>
      <Footer screen={currentScreen} />
    </Box>
  );
}

export function launchTUI(version: string): void {
  render(<App version={version} />);
}

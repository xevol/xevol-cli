import React, { useMemo } from "react";
import { Box, render, useApp, useInput } from "ink";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { useNavigation } from "./hooks/useNavigation";
import { TranscriptionList } from "./screens/TranscriptionList";
import { Help } from "./screens/Help";
import { Dashboard } from "./screens/Dashboard";
import { TranscriptionDetail } from "./screens/TranscriptionDetail";
import { SpikeViewer } from "./screens/SpikeViewer";
import { Placeholder } from "./screens/Placeholder";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps): JSX.Element {
  const { exit } = useApp();
  const { currentScreen, params, push, pop, reset } = useNavigation("dashboard");
  const backToDashboard = useMemo(() => () => reset("dashboard"), [reset]);

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

  const listParams = params as { status?: string; sort?: string };
  const detailId = typeof params.id === "string" ? params.id : "";

  const navigation = useMemo(
    () => ({
      push,
    }),
    [push],
  );

  let content: JSX.Element;
  if (currentScreen === "dashboard") {
    content = <Dashboard version={version} navigation={navigation} />;
  } else if (currentScreen === "help") {
    content = <Help onClose={backToDashboard} />;
  } else if (currentScreen === "detail") {
    content = <TranscriptionDetail id={detailId} navigation={navigation} onBack={backToDashboard} />;
  } else if (currentScreen === "spike-viewer") {
    content = <SpikeViewer id={detailId} onBack={backToDashboard} />;
  } else if (currentScreen === "workspaces") {
    content = <Placeholder title="Workspaces" onBack={backToDashboard} />;
  } else if (currentScreen === "settings") {
    content = <Placeholder title="Settings" onBack={backToDashboard} />;
  } else {
    content = (
      <TranscriptionList
        params={listParams}
        navigation={navigation}
        onBack={backToDashboard}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header version={version} screen={currentScreen} />
      <Box flexDirection="column" flexGrow={1}>
        {content}
      </Box>
      <Footer screen={currentScreen} />
    </Box>
  );
}

export function launchTUI(version: string): void {
  render(<App version={version} />);
}

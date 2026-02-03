import React, { useEffect, useMemo, useState } from "react";
import { Box, render, useApp, useInput, useStdout } from "ink";
import { Header } from "./components/Header";
import { Footer, type Hint } from "./components/Footer";
import { useNavigation } from "./hooks/useNavigation";
import { TranscriptionList } from "./screens/TranscriptionList";
import { Help } from "./screens/Help";
import { Dashboard } from "./screens/Dashboard";
import { TranscriptionDetail } from "./screens/TranscriptionDetail";
import { SpikeViewer } from "./screens/SpikeViewer";
import { Placeholder } from "./screens/Placeholder";
import { Settings } from "./screens/Settings";
import { AddUrl } from "./screens/AddUrl";
import { apiFetch } from "../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../lib/config";

interface AppProps {
  version: string;
}

export function App({ version }: AppProps): JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const { currentScreen, params, push, pop, reset } = useNavigation("dashboard");
  const backToDashboard = useMemo(() => () => reset("dashboard"), [reset]);
  const [footerHints, setFooterHints] = useState<Hint[]>([]);
  const [footerStatus, setFooterStatus] = useState<string | undefined>(undefined);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [userPlan, setUserPlan] = useState<string | undefined>(undefined);

  // Fetch user info once on mount
  useEffect(() => {
    void (async () => {
      try {
        const config = (await readConfig()) ?? {};
        const { token } = resolveToken(config);
        if (!token) return;
        const apiUrl = resolveApiUrl(config);
        const data = await apiFetch<Record<string, unknown>>("/auth/cli/status", { token, apiUrl });
        const email =
          (data.email as string | undefined) ??
          (data.user as Record<string, unknown> | undefined)?.email?.toString();
        const plan = (data.plan as string | undefined) ?? undefined;
        if (email) setUserEmail(email);
        if (plan) setUserPlan(plan);
      } catch {
        // Silently ignore — header will just not show user info
      }
    })();
  }, []);

  useEffect(() => {
    setFooterHints([]);
    setFooterStatus(undefined);
  }, [currentScreen]);

  useInput((input) => {
    // Don't intercept keys when text input screens are active
    if (currentScreen === "add-url") return;

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
  const terminal = useMemo(
    () => ({
      columns: stdout.columns ?? 80,
      rows: stdout.rows ?? 24,
    }),
    [stdout.columns, stdout.rows],
  );

  const navigation = useMemo(
    () => ({
      push,
    }),
    [push],
  );

  let content: JSX.Element;
  if (currentScreen === "dashboard") {
    content = (
      <Dashboard
        version={version}
        navigation={navigation}
        setFooterHints={setFooterHints}
        setFooterStatus={setFooterStatus}
      />
    );
  } else if (currentScreen === "help") {
    content = <Help onClose={backToDashboard} setFooterHints={setFooterHints} />;
  } else if (currentScreen === "detail") {
    content = (
      <TranscriptionDetail
        id={detailId}
        navigation={navigation}
        onBack={backToDashboard}
        terminal={terminal}
        setFooterHints={setFooterHints}
      />
    );
  } else if (currentScreen === "spike-viewer") {
    content = (
      <SpikeViewer
        id={detailId}
        onBack={backToDashboard}
        terminal={terminal}
        setFooterHints={setFooterHints}
      />
    );
  } else if (currentScreen === "workspaces") {
    content = <Placeholder title="Workspaces" onBack={backToDashboard} setFooterHints={setFooterHints} />;
  } else if (currentScreen === "settings") {
    content = <Settings onBack={backToDashboard} setFooterHints={setFooterHints} />;
  } else if (currentScreen === "add-url") {
    content = (
      <AddUrl
        onBack={backToDashboard}
        terminal={terminal}
        setFooterHints={setFooterHints}
      />
    );
  } else {
    content = (
      <TranscriptionList
        params={listParams}
        navigation={navigation}
        onBack={backToDashboard}
        terminal={terminal}
        setFooterHints={setFooterHints}
        setFooterStatus={setFooterStatus}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Header version={version} screen={currentScreen} email={userEmail} plan={userPlan} />
      <Box flexDirection="column" flexGrow={1}>
        <Box key={currentScreen} flexDirection="column" flexGrow={1}>
          {content}
        </Box>
      </Box>
      <Footer hints={footerHints} status={footerStatus} />
    </Box>
  );
}

export function launchTUI(version: string): void {
  render(<App version={version} />);
}

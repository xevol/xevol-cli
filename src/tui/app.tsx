import { Box, render, Text, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";
import { readConfig, resolveApiUrl, resolveToken } from "../lib/config";
import { checkForUpdate } from "../lib/update-check";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { StatsBar } from "./components/StatsBar";
import { InputProvider, useInputLock } from "./context/InputContext";
import { LayoutProvider, useLayout } from "./context/LayoutContext";
import { useNavigation } from "./hooks/useNavigation";
import { useTerminal } from "./hooks/useTerminal";
import { AddUrl } from "./screens/AddUrl";
import { Dashboard } from "./screens/Dashboard";
import { Help } from "./screens/Help";
import { Settings } from "./screens/Settings";
import { SpikeViewer } from "./screens/SpikeViewer";
import { TranscriptionDetail } from "./screens/TranscriptionDetail";
import { TranscriptionList } from "./screens/TranscriptionList";
import { Workspaces } from "./screens/Workspaces";

interface AppProps {
  version: string;
}

function AppInner({ version }: AppProps): JSX.Element {
  const { exit } = useApp();
  const { currentScreen, params, push, pop, reset } = useNavigation("dashboard");
  const { footerHints, footerStatus, setFooterHints, setFooterStatus } = useLayout();
  const { isInputActive } = useInputLock();
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [userPlan, setUserPlan] = useState<string | undefined>(undefined);
  const [statsTotal, setStatsTotal] = useState<number | undefined>(undefined);
  const [statsUsed, setStatsUsed] = useState<number | undefined>(undefined);
  const [statsLimit, setStatsLimit] = useState<number | undefined>(undefined);
  const [statsWorkspace, setStatsWorkspace] = useState<string | undefined>(undefined);
  const [updateInfo, setUpdateInfo] = useState<{ current: string; latest: string } | null>(null);

  // Check for updates (non-blocking, once per day)
  useEffect(() => {
    void checkForUpdate(version).then((info) => {
      if (info) setUpdateInfo(info);
    });
  }, [version]);

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
          (data.email as string | undefined) ?? (data.user as Record<string, unknown> | undefined)?.email?.toString();
        const plan = (data.plan as string | undefined) ?? undefined;
        if (email) setUserEmail(email);
        if (plan) setUserPlan(plan);
        const total = (data.total as number | undefined) ?? (data.transcriptionCount as number | undefined);
        const used = (data.used as number | undefined) ?? (data.monthlyUsage as number | undefined);
        const planLimit = (data.limit as number | undefined) ?? (data.monthlyLimit as number | undefined);
        const workspace = (data.workspace as string | undefined) ?? (data.workspaceName as string | undefined);
        if (total !== undefined) setStatsTotal(total);
        if (used !== undefined) setStatsUsed(used);
        if (planLimit !== undefined) setStatsLimit(planLimit);
        if (workspace) setStatsWorkspace(workspace);
      } catch {
        // Silently ignore — header will just not show user info
      }
    })();
  }, []);

  useEffect(() => {
    setFooterHints([]);
    setFooterStatus(undefined);
  }, [setFooterHints, setFooterStatus]);

  useInput((input) => {
    // Don't intercept keys when any text input is active
    if (isInputActive) return;

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
  const terminal = useTerminal(100);

  // Terminal min-size guard
  if (terminal.columns < 60 || terminal.rows < 15) {
    return (
      <Box>
        <Text color="yellow">
          Terminal too small ({terminal.columns}×{terminal.rows}). Need at least 60×15.
        </Text>
      </Box>
    );
  }

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
    content = <Help onClose={pop} />;
  } else if (currentScreen === "detail") {
    content = <TranscriptionDetail id={detailId} navigation={navigation} onBack={pop} terminal={terminal} />;
  } else if (currentScreen === "spike-viewer") {
    content = <SpikeViewer id={detailId} onBack={pop} terminal={terminal} />;
  } else if (currentScreen === "workspaces") {
    content = <Workspaces onBack={pop} />;
  } else if (currentScreen === "settings") {
    content = <Settings onBack={pop} />;
  } else if (currentScreen === "add-url") {
    content = <AddUrl onBack={pop} terminal={terminal} />;
  } else {
    content = <TranscriptionList params={listParams} navigation={navigation} onBack={pop} terminal={terminal} />;
  }

  return (
    <Box flexDirection="column">
      <Header version={version} screen={currentScreen} email={userEmail} plan={userPlan} />
      <Box flexDirection="column" flexGrow={1}>
        <Box key={currentScreen} flexDirection="column" flexGrow={1}>
          {content}
        </Box>
      </Box>
      <StatsBar total={statsTotal} used={statsUsed} limit={statsLimit} workspace={statsWorkspace} />
      <Footer hints={footerHints} status={footerStatus} />
      {updateInfo && (
        <Box paddingX={1}>
          <Text color="yellow" dimColor>
            Update available: {updateInfo.current} → {updateInfo.latest} (npm i -g xevol)
          </Text>
        </Box>
      )}
    </Box>
  );
}

export function App({ version }: AppProps): JSX.Element {
  return (
    <InputProvider>
      <LayoutProvider>
        <AppInner version={version} />
      </LayoutProvider>
    </InputProvider>
  );
}

export function launchTUI(version: string): void {
  render(<App version={version} />);
}

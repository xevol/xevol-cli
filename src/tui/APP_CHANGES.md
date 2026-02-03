# Changes needed in app.tsx

## StatsBar Integration

### Import
Add to imports:
```tsx
import { StatsBar } from "./components/StatsBar";
```

### State
Add state variables alongside existing `userEmail` / `userPlan`:
```tsx
const [statsTotal, setStatsTotal] = useState<number | undefined>(undefined);
const [statsUsed, setStatsUsed] = useState<number | undefined>(undefined);
const [statsLimit, setStatsLimit] = useState<number | undefined>(undefined);
const [statsWorkspace, setStatsWorkspace] = useState<string | undefined>(undefined);
```

### In the existing `/auth/cli/status` fetch (useEffect on mount)
After setting email and plan, also extract stats:
```tsx
const total = (data.total as number | undefined) ?? (data.transcriptionCount as number | undefined);
const used = (data.used as number | undefined) ?? (data.monthlyUsage as number | undefined);
const planLimit = (data.limit as number | undefined) ?? (data.monthlyLimit as number | undefined);
const workspace = (data.workspace as string | undefined) ?? (data.workspaceName as string | undefined);
if (total !== undefined) setStatsTotal(total);
if (used !== undefined) setStatsUsed(used);
if (planLimit !== undefined) setStatsLimit(planLimit);
if (workspace) setStatsWorkspace(workspace);
```

### In the JSX layout
Add `<StatsBar>` between the content and `<Footer>`:
```tsx
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
  </Box>
);
```

The StatsBar will show something like: `42 transcriptions · 15/50 this month · my-workspace`
It uses dim/secondary styling so it doesn't distract from the main content.

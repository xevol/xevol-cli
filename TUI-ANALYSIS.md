# TUI Mode Analysis for xevol-cli

> **Date:** 2026-02-03  
> **Status:** Research complete — ready for implementation planning  
> **Scope:** Adding keyboard-driven interactive/TUI mode alongside existing CLI commands

---

## Table of Contents

1. [Library Comparison](#1-library-comparison)
2. [Recommendation: Ink](#2-recommendation-ink)
3. [Architecture](#3-architecture)
4. [Screen Designs](#4-screen-designs)
5. [Keyboard Navigation Map](#5-keyboard-navigation-map)
6. [Implementation Plan](#6-implementation-plan)
7. [Reference CLIs & Patterns](#7-reference-clis--patterns)
8. [Technical Considerations](#8-technical-considerations)

---

## 1. Library Comparison

### Full-TUI Libraries (persistent screen, layout engine)

| Library | Downloads/wk | Stars | Last Release | Bun Compat | Notes |
|---------|-------------|-------|--------------|------------|-------|
| **Ink** | ~2M | 29.7k | Active (v6) | ⚠️ Partial¹ | React for CLIs. Flexbox via Yoga. Best ecosystem. |
| **blessed** | ~1.7M | 11.5k | 2017 (abandoned) | ✅ | ncurses-like. Powerful but unmaintained. |
| **neo-blessed** | ~6k | 300 | 2021 (stale) | ✅ | blessed fork. Barely maintained. |
| **terminal-kit** | ~100-190k | 3.3k | Active | ✅ | Full terminal control. Low-level. Verbose API. |

### Prompt/Wizard Libraries (step-by-step, not persistent TUI)

| Library | Downloads/wk | Stars | Notes |
|---------|-------------|-------|-------|
| **@inquirer/prompts** | ~5M | — | Already in xevol-cli. Good for one-off prompts. |
| **@clack/prompts** | ~1M | 6k | Beautiful prompts. Linear wizard flow only. |
| **enquirer** | ~15M | 7.5k | Mature. Prompts only, no persistent UI. |
| **prompts** | ~20M | 8.5k | Simple. No persistent screens. |

### Not Suitable

| Library | Reason |
|---------|--------|
| **charm** | Abandoned (2015). Superseded by everything above. |
| **react-blessed** | 300 downloads/wk. Dead project. |

¹ Ink + Bun: There was a known `useInput` issue on Bun (issue #6862, Nov 2023). Bun's Node.js compat has improved significantly since then (Bun 1.1+). The issue was specific to raw mode stdin handling on WSL. **Current Bun (1.2+) works with Ink** — verified pattern: Bun builds the CLI → Node runs it (standard for npm-published CLIs). Since xevol uses `bun build --target node`, the output runs on Node regardless.

---

## 2. Recommendation: Ink

**Primary choice: Ink v5/v6** with the `ink-ui` component library.

### Why Ink

1. **React mental model** — Components, hooks, state management. Massive talent pool already knows React.
2. **Flexbox layout** — Yoga engine provides real CSS-like layout (`flexDirection`, `padding`, `gap`). No manual coordinate math.
3. **Largest ecosystem** — `ink-text-input`, `ink-select-input`, `ink-spinner`, `ink-table`, `ink-ui` (official component kit with FocusContext, ScrollArea, etc.)
4. **Active maintenance** — vadimdemedes actively maintains. v6 is current.
5. **Testing story** — `ink-testing-library` for component tests, just like `@testing-library/react`.
6. **Build compatibility** — `bun build --target node` produces Node-compatible output. Ink works perfectly in Node. Zero runtime risk.
7. **Incremental adoption** — Can render a single Ink component for one screen without converting the whole CLI.

### Why NOT the alternatives

- **blessed/neo-blessed**: Abandoned. Coordinate-based layout is painful. No component reuse model.
- **terminal-kit**: Verbose imperative API. Every screen is manual cursor management. Great for games, overkill for data-driven UI.
- **clack/prompts/enquirer**: Not TUI libraries. They're prompt wizards. Can't build persistent screens with navigation.

### Risk Mitigation

- **Bundle size**: Ink adds React (~130kb gzip). For a CLI tool this is fine — it's loaded once on launch, not a browser bundle.
- **Bun runtime**: Build target is Node. No Bun-specific runtime issues.
- **Complexity**: Start with one screen (list). Expand incrementally. Ink's component model makes this natural.

---

## 3. Architecture

### Entry Point Strategy

```
xevol                    → Launch TUI dashboard (replaces current help display)
xevol list               → Non-interactive output (unchanged)
xevol list --interactive → Launch TUI list view directly
xevol view <id>          → Non-interactive output (unchanged)
xevol tui                → Explicit TUI launch (alias for bare `xevol`)
```

### File Structure

```
src/
├── index.ts                    # Commander setup (unchanged)
├── commands/                   # Existing CLI commands (unchanged)
│   ├── list.ts
│   ├── view.ts
│   ├── stream.ts
│   └── ...
├── tui/                        # NEW: TUI mode
│   ├── app.tsx                 # Root TUI component + router
│   ├── hooks/
│   │   ├── useApi.ts           # Shared data fetching (wraps lib/api.ts)
│   │   ├── useKeymap.ts        # Global keybinding handler
│   │   ├── useNavigation.ts    # Screen stack / router state
│   │   └── usePagination.ts    # Pagination state
│   ├── screens/
│   │   ├── Dashboard.tsx       # Home screen
│   │   ├── TranscriptionList.tsx
│   │   ├── TranscriptionDetail.tsx
│   │   ├── SpikeViewer.tsx
│   │   ├── Settings.tsx
│   │   └── Help.tsx            # Keybindings overlay
│   ├── components/
│   │   ├── Header.tsx          # Top bar (breadcrumb + version)
│   │   ├── Footer.tsx          # Status bar (keybinding hints)
│   │   ├── SearchInput.tsx     # Live filter input
│   │   ├── StatusBadge.tsx     # Colored status indicator
│   │   └── ScrollableText.tsx  # Scrollable text panel
│   └── theme.ts                # Colors, spacing constants
└── lib/                        # Shared (used by both CLI and TUI)
    ├── api.ts                  # ✅ Already abstracted perfectly
    ├── config.ts
    ├── output.ts               # CLI-only formatting
    └── utils.ts
```

### Shared Data Layer

The existing `apiFetch()` in `lib/api.ts` is already perfectly abstracted — it handles auth, URL resolution, error parsing, and workspace headers. The TUI hooks just wrap it:

```tsx
// src/tui/hooks/useApi.ts
import { useState, useEffect } from "react";
import { apiFetch } from "../../lib/api";
import { readConfig, resolveToken, resolveApiUrl } from "../../lib/config";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApi<T>(path: string, query?: Record<string, unknown>): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const config = (await readConfig()) ?? {};
        const { token } = resolveToken(config);
        if (!token) throw new Error("Not logged in");
        const apiUrl = resolveApiUrl(config);
        const result = await apiFetch<T>(path, { query, token, apiUrl });
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [path, JSON.stringify(query), refreshKey]);

  return { data, loading, error, refresh: () => setRefreshKey(k => k + 1) };
}
```

### TUI Launch Integration

```tsx
// In src/index.ts — modify the no-args handler:

const args = process.argv.slice(2);
if (args.length === 0) {
  // Launch TUI instead of printing help
  const { launchTUI } = await import("./tui/app.js");
  await launchTUI();
} else {
  await program.parseAsync(process.argv);
}
```

```tsx
// src/tui/app.tsx
import React from "react";
import { render } from "ink";
import { App } from "./screens/Dashboard.js";

export async function launchTUI() {
  const { waitUntilExit } = render(<App />);
  await waitUntilExit();
}
```

---

## 4. Screen Designs

### 4.1 Dashboard (Home)

```
╭─ xevol v0.5.1 ─────────────────────────────────────────╮
│                                                          │
│  ■ Workspace: my-workspace                               │
│  ■ API: https://api.xevol.com                            │
│  ■ 142 transcriptions · 12.4 hrs processed               │
│                                                          │
│  Recent Transcriptions                                   │
│  ─────────────────────                                   │
│  > React Server Components Deep Dive    3h ago    42:15  │
│    Building CLI Tools with Bun          1d ago    28:03  │
│    Advanced TypeScript Patterns         2d ago    55:41  │
│    System Design Interview Prep         3d ago  1:12:08  │
│    Rust for JavaScript Developers       5d ago    36:22  │
│                                                          │
│  [l] List all  [a] Add new  [s] Settings  [?] Help      │
╰──────────────────────────────────────────────────────────╯
```

**Data:** `GET /v1/transcriptions?limit=5&sort=createdAt:desc` + usage stats  
**Keys:** `↑↓` navigate list, `Enter` view detail, `l` full list, `a` add, `s` settings, `?` help, `q` quit

### 4.2 Transcription List

```
  Transcriptions (142 total)                    Page 1/8
  ────────────────────────────────────────────────────────
  Filter: _______________          Sort: created ▼

  > ● React Server Components Deep Dive     3h ago  42:15
    ● Building CLI Tools with Bun           1d ago  28:03
    ○ Advanced TypeScript Patterns          2d ago  55:41
    ● System Design Interview Prep          3d ago 1:12:08
    ✗ Rust for JavaScript Developers        5d ago  36:22
    ● Kubernetes Tutorial for Beginners     1w ago  48:17
    ● Understanding Transformers in AI      1w ago  33:09
    ● PostgreSQL Performance Tuning         2w ago  41:52
    ● GraphQL vs REST in 2024               2w ago  22:14
    ● Docker Compose Best Practices         3w ago  29:48

  ↑↓ navigate  Enter view  / search  n/p page  x delete
  Space select  Tab sort  q back
```

**Legend:** `●` complete, `○` pending, `✗` error  
**Data:** Reuses exact same API call as `list` command  
**Keys:** Full navigation (see §5)

### 4.3 Transcription Detail

```
  React Server Components Deep Dive
  ────────────────────────────────────────────────────────
  Channel: Theo - t3.gg (@t3dotgg)
  Duration: 42:15 | Lang: en | Status: complete
  URL: https://youtube.com/watch?v=...
  Created: 2026-02-03 01:23
  ────────────────────────────────────────────────────────

  Summary
  ────────
  This video explores React Server Components (RSC) in
  depth, covering the mental model shift from traditional
  client-side React. Key topics include: server-only code
  execution, the RSC wire format, streaming SSR...
  [truncated — scroll for more]

  ────────────────────────────────────────────────────────
  [t] Full transcript  [k] Spikes  [e] Export  [o] Open
  [d] Delete  q back
```

**Data:** `GET /v1/analysis/:id`  
**Keys:** `↑↓/j/k` scroll, `t` transcript, `k` spikes, `e` export, `o` open in browser

### 4.4 Spike Viewer (Streaming)

```
  Spike: Key Insights — React Server Components Deep Dive
  ────────────────────────────────────────────────────────

  ## Server Components vs Client Components

  The fundamental difference is where code executes:

  - **Server Components** run only on the server. They
    can directly access databases, file systems, and
    other server resources without exposing them to the
    client bundle.

  - **Client Components** are the React we already know.
    They run in the browser and handle interactivity...

  ▌ streaming...

  ────────────────────────────────────────────────────────
  ↑↓ scroll  q back  r retry
```

**Data:** SSE stream via existing `streamSSE()` from `lib/sse.ts`  
**Keys:** `↑↓/j/k` scroll, `q` back, `r` restart stream

### 4.5 Settings Screen

```
  Settings
  ────────────────────────────────────────────────────────

  API URL          https://api.xevol.com     [Enter to edit]
  Default Language en                         [Enter to edit]
  Page Size        20                         [Enter to edit]
  API Timeout      30000ms                    [Enter to edit]

  ────────────────────────────────────────────────────────
  Workspace: my-workspace (ws_abc123)
  Token: xevol_cli_...redacted  [expires 2026-04-01]

  ────────────────────────────────────────────────────────
  ↑↓ navigate  Enter edit  q back
```

**Data:** Reads from `~/.xevol/config.json` via existing `readConfig()`  
**Keys:** `↑↓` navigate fields, `Enter` edit inline, `Esc` cancel edit

### 4.6 Help Overlay

```
  ╭─ Keybindings ────────────────────────────────────────╮
  │                                                       │
  │  Navigation                                           │
  │  ↑/k     Move up          ↓/j     Move down          │
  │  Enter   Select/Open      Esc/q   Back/Quit          │
  │  n/→     Next page        p/←     Previous page      │
  │  g       Go to top        G       Go to bottom       │
  │                                                       │
  │  Actions                                              │
  │  /       Search/Filter    Space   Toggle select       │
  │  a       Add new          d       Delete              │
  │  e       Export           o       Open in browser     │
  │  r       Refresh          Tab     Change sort         │
  │                                                       │
  │  Global                                               │
  │  ?       This help        q       Quit TUI            │
  │  1       Dashboard        2       List                │
  │  3       Settings                                     │
  │                                                       │
  ╰──────────────────────────── Press any key to close ───╯
```

---

## 5. Keyboard Navigation Map

### Global Keys (available everywhere)

| Key | Action |
|-----|--------|
| `q` / `Ctrl+C` | Quit TUI (or go back if not on dashboard) |
| `?` | Toggle help overlay |
| `1` | Go to Dashboard |
| `2` | Go to List |
| `3` | Go to Settings |
| `Esc` | Close overlay / cancel / go back |

### List Navigation

| Key | Action |
|-----|--------|
| `↑` / `k` | Move cursor up |
| `↓` / `j` | Move cursor down |
| `g` | Jump to first item |
| `G` | Jump to last item |
| `Enter` | Open selected item |
| `n` / `→` | Next page |
| `p` / `←` | Previous page |
| `/` | Focus search input |
| `Tab` | Cycle sort field |
| `Space` | Toggle selection (multi-select) |
| `x` | Delete selected |
| `e` | Export selected |
| `r` | Refresh list |

### Detail View

| Key | Action |
|-----|--------|
| `↑` / `k` | Scroll up |
| `↓` / `j` | Scroll down |
| `t` | View full transcript |
| `k` | View spikes |
| `e` | Export |
| `o` | Open URL in browser |
| `d` | Delete |
| `q` | Back to list |

### Search Input (when focused)

| Key | Action |
|-----|--------|
| Any character | Filter list in real-time |
| `Enter` | Confirm search, return focus to list |
| `Esc` | Clear search, return focus to list |

---

## 6. Implementation Plan

### Phase 1: Foundation (3-5 days)

**Goal:** Ink setup, navigation shell, list screen working.

- [ ] Install Ink + React + TypeScript JSX config
- [ ] Create `src/tui/app.tsx` with screen router
- [ ] Implement `useNavigation` hook (screen stack with push/pop)
- [ ] Implement `useApi` hook (wraps existing `apiFetch`)
- [ ] Build `TranscriptionList` screen with arrow key navigation
- [ ] Build `Header` and `Footer` components
- [ ] Wire up `xevol` (no args) to launch TUI
- [ ] Add `xevol tui` explicit command

**Complexity:** Medium  
**Key risk:** Ink + Bun build pipeline. Mitigate by testing early.

```bash
# Dependencies to add
bun add ink react ink-text-input ink-select-input ink-spinner
bun add -d @types/react
```

```json
// tsconfig.json additions
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

### Phase 2: Detail Views (2-3 days)

**Goal:** View transcription details, navigate between list and detail.

- [ ] Build `TranscriptionDetail` screen
- [ ] Build `ScrollableText` component for long content
- [ ] Add drill-down: List → Detail → back
- [ ] Show summary, metadata, action hints
- [ ] Implement `o` (open in browser via `open` command)

**Complexity:** Low-Medium

### Phase 3: Dashboard + Streaming (3-4 days)

**Goal:** Dashboard home screen, spike streaming in TUI.

- [ ] Build `Dashboard` screen with recent items + stats
- [ ] Build `SpikeViewer` screen with SSE streaming
- [ ] Integrate existing `streamSSE()` with Ink rendering
- [ ] Auto-scroll during streaming, manual scroll after

**Complexity:** Medium-High (SSE + Ink rendering requires careful state management)

```tsx
// Streaming integration sketch
function SpikeViewer({ spikeId }: { spikeId: string }) {
  const [content, setContent] = useState("");
  const [streaming, setStreaming] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      const config = (await readConfig()) ?? {};
      const { token } = resolveToken(config);
      const apiUrl = resolveApiUrl(config);
      
      for await (const event of streamSSE(`/spikes/stream/${spikeId}`, {
        token, apiUrl, signal: controller.signal,
      })) {
        if (event.event === "chunk" || !event.event) {
          try {
            const parsed = JSON.parse(event.data);
            const text = parsed.text ?? parsed.content ?? event.data;
            setContent(prev => prev + text);
          } catch {
            setContent(prev => prev + event.data);
          }
        }
        if (event.event === "done" || event.event === "end") {
          setStreaming(false);
        }
      }
    })();
    return () => controller.abort();
  }, [spikeId]);

  return (
    <Box flexDirection="column">
      <ScrollableText content={content} />
      {streaming && <Spinner label="streaming..." />}
    </Box>
  );
}
```

### Phase 4: Search, Settings, Polish (2-3 days)

**Goal:** Live search, settings screen, multi-select, polish.

- [ ] Build `SearchInput` with live filtering (debounced API calls)
- [ ] Build `Settings` screen (read/write config)
- [ ] Implement multi-select with `Space` key
- [ ] Batch operations (delete multiple, export multiple)
- [ ] Help overlay
- [ ] Terminal resize handling (Ink handles this automatically)
- [ ] Error states (network errors, auth expiry)
- [ ] Loading states with spinners

**Complexity:** Medium

### Phase 5: Testing + Release (1-2 days)

- [ ] Unit tests with `ink-testing-library`
- [ ] Integration test: launch TUI, navigate, verify renders
- [ ] Update README with TUI screenshots/GIFs
- [ ] Version bump

**Total estimate: 11-17 days**

---

## 7. Reference CLIs & Patterns

### lazygit
- **What makes it great:** Single-letter keybindings, panel-based layout, contextual key hints at bottom, everything is 1-2 keystrokes away.
- **Adopt:** Footer with context-sensitive key hints. Panel navigation feel.

### k9s
- **What makes it great:** Vim-like navigation, `:command` mode, breadcrumb header showing current context, real-time resource updates.
- **Adopt:** Breadcrumb header (`Dashboard > Transcriptions > "React Server Components"`). Vim keys (j/k).

### gh dash
- **What makes it great:** Clean card layout, tab-based sections, color-coded status.
- **Adopt:** Card-style list items (xevol already does this in CLI mode). Status color coding.

### Vercel CLI / Railway CLI
- **What makes it great:** Smooth prompts that flow naturally, progressive disclosure.
- **Adopt:** The TUI should feel like a natural extension of the existing CLI, not a foreign app.

### Key Patterns to Adopt

1. **Context-sensitive footer** — Always show available keys for current screen
2. **Breadcrumb header** — Show navigation path
3. **Vim + Arrow duality** — Support both `j/k` and `↑/↓`
4. **Instant feedback** — No loading without spinners
5. **Graceful degradation** — If terminal is too small, show message instead of broken layout
6. **`q` is always back/quit** — Muscle memory from every good TUI

---

## 8. Technical Considerations

### Terminal Resize
Ink handles this automatically via Yoga layout engine. Components re-render on resize. Add a minimum terminal size check:

```tsx
function App() {
  const { columns, rows } = useStdout();
  if (columns < 60 || rows < 15) {
    return <Text color="yellow">Terminal too small (need 60×15, got {columns}×{rows})</Text>;
  }
  return <Router />;
}
```

### Color Support
Ink uses `chalk` internally (already a dependency). Respects `NO_COLOR`, `FORCE_COLOR`, `--no-color` flag. The existing `--no-color` flag in xevol-cli already sets `chalk.level = 0`.

### Accessibility
- All interactive elements reachable by keyboard (no mouse needed)
- High-contrast default colors
- Screen reader: terminal TUIs are inherently accessible to screen readers that read terminal output
- Respect `TERM` environment variable for capability detection

### Build Pipeline
Current build: `bun build src/index.ts --outdir dist --target node --minify`

JSX requires adjustment. Two options:

**Option A: Bun's built-in JSX support (recommended)**
```bash
# bun.build already supports JSX natively
bun build src/index.ts --outdir dist --target node --minify
```
Just ensure `tsconfig.json` has `"jsx": "react-jsx"`. Bun handles the rest.

**Option B: Pre-compile TSX → TS**
Not needed — Bun handles JSX/TSX out of the box.

### Bundle Size Impact

| Dependency | Size (gzip) | Purpose |
|-----------|-------------|---------|
| react | ~45kb | Core |
| react-reconciler | ~35kb | Ink's renderer |
| ink | ~25kb | Terminal renderer |
| yoga-wasm-web | ~50kb | Flexbox layout |
| **Total** | **~155kb** | — |

This is a CLI tool installed globally. 155kb additional is negligible.

### Non-Interactive Fallback
When `process.stdout.isTTY` is false (piped output), skip TUI:

```tsx
if (!process.stdout.isTTY) {
  // Fall back to regular help output
  program.help();
} else {
  const { launchTUI } = await import("./tui/app.js");
  await launchTUI();
}
```

---

## Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Library** | Ink v6 | React model, Flexbox, ecosystem, active maintenance |
| **Entry** | `xevol` (no args) launches TUI | Natural discovery, explicit `xevol tui` also works |
| **Data layer** | Existing `apiFetch()` wrapped in React hooks | Zero duplication, shared auth/config |
| **Navigation** | Vim + arrow keys, `q` back, `?` help | Industry standard for TUIs |
| **Rollout** | 5 phases, ~2-3 weeks | List first, then detail, dashboard, search, polish |
| **Risk** | Low | Ink is proven. Build pipeline already supports JSX. Non-interactive commands unchanged. |

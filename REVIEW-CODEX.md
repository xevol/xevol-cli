# Code Review: xevol-cli v0.11.3 Performance Changes

**Reviewer**: Claude (subagent)  
**Date**: 2025-07-27  
**Scope**: 814-line diff across cache, config, useApi hook, markdown renderer, and 5 TUI screens  
**Verdict**: Mostly good direction. Several real bugs and design issues below.

---

## Critical Issues

### 1. Markdown parse cache key collisions (HIGH)

**File**: `src/tui/utils/renderMarkdown.ts:27-31`

```ts
function parseCacheKey(markdown: string, width: number): string {
  const prefix = markdown.slice(0, 100);
  const suffix = markdown.slice(-100);
  return `${markdown.length}:${width}:${prefix}:${suffix}`;
}
```

This is a **hash collision waiting to happen**. Two different markdown strings with the same length, same first 100 chars, and same last 100 chars will produce identical keys. This is trivially achievable with content that differs only in the middle — e.g., a 500-char document where only chars 200-300 differ. The cache will silently return wrong rendered content.

**Fix**: Use a real hash. Even a simple `crypto.createHash('md5').update(markdown).digest('hex')` would be fine for a local cache. Or just use the full string as the key since the cache is capped at 10 entries — 10 markdown strings in memory is nothing.

### 2. `stripInlineMarkdown` is a no-op for inline code (MEDIUM-HIGH)

**File**: `src/tui/utils/renderMarkdown.ts` (the `stripInlineMarkdown` function, around line 196)

```ts
result = result.replace(/`([^`]+)`/g, "`$1`");
```

This replaces `` `code` `` with... `` `code` ``. It's a no-op — the backticks are preserved. Meanwhile, `wrapPlainText` calculates width including those backticks, but `formatParsedLine` → `applyInlineFormatting` adds ANSI around them making the visible width different from what was measured. This means **word-wrap boundaries are wrong for any line containing inline code**. The line will be wrapped at a width that includes backtick characters that get visually replaced by ANSI sequences.

This is a regression from the old approach where ANSI was applied first and then `wrapPlain` + `rebuildStyledLines` dealt with the mismatch (albeit imperfectly).

### 3. `memCacheEvict` only evicts one entry, checked after insertion (MEDIUM)

**File**: `src/lib/cache.ts:13-17`

```ts
function memCacheEvict(): void {
  if (memCache.size > MEM_CACHE_MAX) {
    const firstKey = memCache.keys().next().value;
    if (firstKey !== undefined) memCache.delete(firstKey);
  }
}
```

The eviction runs **after** `memCache.set()`, so the map can temporarily hold `MEM_CACHE_MAX + 1` entries. More importantly, `memCacheEvict()` is called once per set, but if something bulk-inserts (e.g., disk cache is warm with 100 entries and they're all accessed), the map will grow to 100 entries because eviction only removes **one** entry when size exceeds 50. Use `>=` and a `while` loop, or at minimum check size before insertion.

Same issue in `parseCacheSet` (renderMarkdown.ts:33-38) though max=10 makes it less impactful.

### 4. Race condition in `useApi` stale-while-revalidate (MEDIUM)

**File**: `src/tui/hooks/useApi.ts:41-53`

```ts
const cached = await getCached<T>(key);
if (cached) {
  if (mountedRef.current) {
    setData(cached.data);
    if (!cached.stale) {
      setLoading(false);
    }
  }
} else {
  setLoading(true);
}
```

When `cached` exists and is stale, `setLoading` is never called — it stays at its initial value of `false`. So the first render of a component with stale data shows `loading: false` with stale data, then jumps to fresh data without any loading indicator. That's fine for UX, but if the fetch **fails**, the error is swallowed (line 78-80: `if (!cached) { setError(...) }`), and the user sees stale data with no indication it's stale or that a refresh failed. This is a silent failure mode.

### 5. `ANSI_RE` regex with `lastIndex` reset is fragile (LOW-MEDIUM)

**File**: `src/tui/utils/renderMarkdown.ts:4,9`

```ts
const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(text: string): string {
  ANSI_RE.lastIndex = 0;
  return text.replace(ANSI_RE, "");
}
```

Using a module-level regex with the `g` flag and manually resetting `lastIndex` is a classic footgun. It works here because `String.prototype.replace` resets `lastIndex` internally, making the manual reset redundant. But if anyone ever uses `ANSI_RE.test()` or `ANSI_RE.exec()` elsewhere (which mutate `lastIndex`), concurrent/interleaved calls will break. The `stripAnsi` function itself is never actually called by the new code (inline markdown is stripped by `stripInlineMarkdown` instead), making this dead code.

---

## Design Issues

### 6. Config cache doesn't invalidate on external file changes

**File**: `src/lib/config.ts:31-33`

```ts
let _configCache: XevolConfig | null = null;
let _configCacheAt = 0;
const CONFIG_TTL = 30_000;
```

The 30-second TTL means if a user runs `xevol login` in another terminal, the TUI won't pick up the new token for up to 30 seconds. The old code re-read every time. This is acceptable for a CLI but worth documenting. Using `fs.watch` or `fs.stat` mtime check would be more correct.

### 7. `useApi` options dep comparison via `JSON.stringify` on every render

**File**: `src/tui/hooks/useApi.ts:25`

```ts
const optionsKey = useMemo(() => JSON.stringify(options), [options]);
```

`useMemo(() => JSON.stringify(options), [options])` — the memo dep is `options` (object reference), so `JSON.stringify` runs on every render anyway if the caller doesn't memoize `options`. The intent is to stabilize the `optionsRef.current` update, but:

- If `options` is a new object each render (which it is in most call sites — inline `{ query: { ... } }`), `JSON.stringify` runs every render.
- The actual `fetchData` callback only depends on `path`, not options, so the stale optionsRef pattern works regardless.
- The `useMemo` is computing a string that's only used as a dep for another `useEffect`. This is just `JSON.stringify` with extra steps. A simple `useRef` + deep comparison would be cleaner.

### 8. Dashboard removed module-level cache but doesn't get stale-while-revalidate benefit for history

**File**: `src/tui/screens/Dashboard.tsx:62-69`

```ts
const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);
const [historyLoaded, setHistoryLoaded] = useState(false);
```

The old code had `_cachedHistory` so navigating away and back was instant. Now it re-reads from disk every mount. `getHistory()` reads a file from disk — fast, but still async. There's a flash of empty state on every Dashboard mount. The `useApi` hook provides stale-while-revalidate for API data, but `getHistory()` doesn't go through `useApi`, so it gets no caching benefit. Consider wrapping history in the cache layer or keeping a simple module-level variable.

### 9. TranscriptionList preview: `parseMarkdownStructure` called in render path without memoization

**File**: `src/tui/screens/TranscriptionList.tsx:759`

```ts
<Text>{renderMarkdownWindow(parseMarkdownStructure(previewData.summary, previewWidth), 0, Math.max(4, terminal.rows - 10)).join("\n")}</Text>
```

`parseMarkdownStructure` is called **inline in JSX** — every render of this component re-parses the markdown. The internal `parseCache` will mitigate this if the content hasn't changed, but the key generation + Map lookup still runs every render. Should be wrapped in `useMemo`.

### 10. `formatParsedLine` regex matching is redundant work

**File**: `src/tui/utils/renderMarkdown.ts:135-155`

The function does a waterfall of `startsWith`, `match`, and `replace` checks. For `BULLET` and `NUM` lines, it uses both `line.match(/^───BULLET\d───/)` and then `line.replace(/^───BULLET\d───/, "")` — two regex operations where one would suffice (use the match result). Minor perf, but this runs for every visible line on every scroll.

```ts
if (line.match(/^───BULLET\d───/)) {
  const content = line.replace(/^───BULLET\d───/, "");
```

Better: use a single regex with capture group, or `line.startsWith("───BULLET")` + `line.indexOf("───", 9)` for the split point.

### 11. Sentinel strings in parsed lines are brittle

**File**: `src/tui/utils/renderMarkdown.ts`

The two-phase approach uses sentinel strings like `───CODE───`, `───H1───`, `───PARA───` embedded in the line content. If user markdown ever contains these literal strings (unlikely but possible), it will be misinterpreted. A structured array of `{ type, content }` objects would be type-safe and avoid any collision risk. The sentinel approach also means every `formatParsedLine` call does string matching instead of a simple switch on an enum.

### 12. BULLET/NUM sentinel only captures single-digit indent

**File**: `src/tui/utils/renderMarkdown.ts:97, 107`

```ts
lines.push(`───BULLET${indent}───${prefix}${wrapped}`);
```

And the regex to match:
```ts
if (line.match(/^───BULLET\d───/)) {
```

`\d` matches a single digit (0-9). Indent is capped at 8 (`Math.min(bulletMatch[1].length, 8)`), so this works. But the regex doesn't match `───BULLET10───` etc. — if the cap is ever raised, this silently breaks. Use `\d+` for safety.

---

## Memory / Leak Concerns

### 13. `previewCacheRef` in TranscriptionList grows unbounded

**File**: `src/tui/screens/TranscriptionList.tsx:120`

```ts
const previewCacheRef = useRef<Map<string, { title: string; summary: string; status: string }>>(new Map());
```

This map grows with every unique preview loaded and is never evicted. In a session where a user scrolls through hundreds of transcriptions, this accumulates. Each entry is small (~1KB), so 1000 entries is ~1MB — not critical, but worth adding a size cap consistent with the caching strategy applied elsewhere.

### 14. Module-level `memCache` and `parseCache` persist across navigation

These are module-level Maps that persist for the process lifetime. This is intentional for performance, but:
- `memCache` stores full API response bodies. 50 entries of potentially large analysis responses (transcripts can be 100KB+) means up to 5MB of retained memory.
- The `ttl * 2` expiry in `getCached` means entries can live much longer than intended if they're accessed within the 2x window.

Not a leak per se, but worth monitoring.

---

## Race Conditions

### 15. AbortController in TranscriptionList preview is good but has a gap

**File**: `src/tui/screens/TranscriptionList.tsx:269-306`

The new AbortController pattern is a significant improvement. However, there's a subtle gap: the abort happens in the cleanup function, but `previewAbortRef.current?.abort()` at line 271 aborts the *previous* controller. If the component unmounts while a timer is pending but before the async IIFE starts, the `setTimeout` callback can still fire after unmount (clearTimeout is in cleanup, but there's a race between cleanup running and the timer firing). The `controller.signal.aborted` checks inside the async function protect against state updates, so this is safe in practice.

### 16. `useApi` fetchData callback stale closure on `path`

**File**: `src/tui/hooks/useApi.ts:35`

```ts
const fetchData = useCallback(async (signal?: AbortSignal) => {
  ...
}, [path]);
```

The callback depends on `path` only. If `options` change without `path` changing, `fetchData` is the same callback reference — but `optionsRef.current` will have been updated. The effect at line 84 spreads `deps`, so option changes in deps will trigger a new fetch. This works correctly but is subtle and fragile.

---

## Positive Changes

- **Two-phase markdown rendering** is a solid architectural improvement. Parsing once and rendering only the visible window is the right approach for large documents.
- **AbortController in TranscriptionList preview** fixes what was likely a real bug with stale preview responses overwriting newer ones.
- **In-memory cache layer** in `cache.ts` eliminates redundant disk I/O for hot paths.
- **Removal of module-level `_cachedRecent`/`_cachedHistory`** in Dashboard in favor of the `useApi` stale-while-revalidate pattern is cleaner architecture.
- **Config caching** eliminates repeated file reads during rapid TUI interactions.

---

## Summary of Action Items

| Priority | Issue | Fix |
|----------|-------|-----|
| 🔴 High | Cache key collisions in markdown parser (#1) | Use full content as key or a real hash |
| 🔴 High | `stripInlineMarkdown` no-op for backticks (#2) | Strip backticks or account for them in width |
| 🟡 Medium | `memCacheEvict` only removes one entry (#3) | Use `while` loop with `>=` |
| 🟡 Medium | Silent failure on stale-while-revalidate error (#4) | Surface stale indicator or log |
| 🟡 Medium | Dashboard history flash on re-mount (#8) | Add module-level cache or use cache layer |
| 🟡 Medium | Inline `parseMarkdownStructure` in JSX (#9) | Wrap in `useMemo` |
| 🟢 Low | Dead `stripAnsi` function (#5) | Remove or use |
| 🟢 Low | Sentinel strings fragility (#11) | Consider structured objects |
| 🟢 Low | Unbounded preview cache (#13) | Add size cap |

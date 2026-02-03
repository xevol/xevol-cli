# Code Review: TranscriptionList.tsx

**Reviewer:** Codex (automated)  
**Date:** 2026-02-03  
**File:** `src/tui/screens/TranscriptionList.tsx` (~830 lines)  
**Supporting files reviewed:** `useApi.ts`, `usePagination.ts`, `SplitLayout.tsx`, `Footer.tsx`

---

## 1. State Management — Re-renders, Race Conditions, Stale Closures

### 1.1 Excessive state atoms cause render cascades

The component has **17 `useState` calls** (lines ~143–162). Many of these change together — e.g., `confirmDelete`+`isDeleting`+`notice`+`deletedIds` all mutate during a single delete flow. Each `setState` triggers a re-render. In a terminal UI where Ink re-paints the entire screen, this is expensive.

**Recommendation:** Consolidate into a `useReducer` with a single dispatch for operation states (`{mode: 'idle' | 'confirming-delete' | 'deleting' | ...}`).

### 1.2 `selectedItem` derived from a stale `selectedIndex`

Line ~236:
```ts
const selectedItem = listItems[selectedIndex];
```

`selectedIndex` is clamped in a **separate effect** (lines ~230–233):
```ts
useEffect(() => {
  if (selectedIndex >= listItems.length) {
    setSelectedIndex(Math.max(0, listItems.length - 1));
  }
}, [listItems.length, selectedIndex]);
```

Between the render where `listItems` shrinks and the effect firing, `selectedItem` can be **undefined** (index out of bounds). This affects every callback that uses `selectedItem` — `handleDelete`, `handleOpen`, keyboard handler's Enter/d/space. They all guard with `if (!selectedItem) return`, so it won't crash, but there's a frame where the UI renders with `selectedItem === undefined` and the confirm-delete prompt shows `Delete undefined? (y/n)` (line ~509).

**Fix:** Derive `selectedIndex` synchronously:
```ts
const clampedIndex = Math.min(selectedIndex, Math.max(0, listItems.length - 1));
```
Use `clampedIndex` everywhere instead of relying on an effect to fix it later.

### 1.3 `handleDelete` closes over `selectedItem` — potential stale closure

Line ~275:
```ts
const handleDelete = useCallback(async () => {
  if (!selectedItem) return;
  const itemId = selectedItem.id;
  ...
}, [selectedItem, refresh]);
```

This is fine because `selectedItem` is in deps. But the `useInput` callback (line ~371) is **not memoized** — it's re-created every render, which is correct for Ink's `useInput` but means every keystroke triggers a fresh closure. No bug here, just noting it's correct by accident.

### 1.4 `prevDataRef` keeps stale data indefinitely

Line ~183:
```ts
const prevDataRef = useRef<Record<string, unknown> | null>(null);
```

If the API returns an error (e.g., 500), `validatedData` is null, and `data` falls back to `prevDataRef.current`. This means the user sees **stale data from a previous successful fetch** with no indication it's stale. The `error` state from `useApi` would show, but the list still renders old items. This is arguably a feature ("keep last good data"), but it masks when things are actually broken, and the user might try to delete an already-deleted item.

---

## 2. Preview Fetch/Cache — Debounce + AbortController

### 2.1 The pattern is mostly robust, but has a cache-poisoning edge case

Lines ~239–284. The flow:
1. Check cache → instant render
2. If miss: abort previous, set 150ms debounce timer, fetch, cache result

**Edge case:** If the user selects item A, the fetch starts, then selects item B (cache hit), then A's fetch completes — the `setPreviewData(preview)` on line ~272 will overwrite B's preview with A's data. The abort controller is replaced on the B selection, but B was a cache hit so no new controller was created. The A controller was aborted... **wait, actually it was**. Line ~259 `previewAbortRef.current?.abort()` fires when B is selected. So the A fetch should be aborted. Let me re-read.

When B is a cache hit, the effect still runs (lines ~243–245):
```ts
const cached = previewCacheRef.current.get(selectedItem.id);
if (cached) {
  setPreviewData(cached);
  setPreviewLoading(false);
  return;   // <-- early return, cleanup function still registered
}
```

The **cleanup function** from the *previous* effect invocation (for item A) runs before this effect runs. So the A controller is aborted via cleanup. ✅ This is correct.

But there's a subtle issue: the cleanup runs `controller.abort()` for the controller created in *that* effect invocation. The `previewAbortRef` is also set. So we have **two** abort mechanisms — cleanup and the manual `previewAbortRef.current?.abort()` on line ~259. The ref-based abort is redundant when the effect cleanup handles it. It's not harmful, just unnecessary complexity.

### 2.2 Cache never expires, never invalidates

`previewCacheRef` is a `Map` that only grows (line ~166). There's no TTL, no LRU eviction, no invalidation after delete. If the user deletes a transcription and somehow navigates back, the stale preview is served from cache.

**Also:** For a user browsing 500+ transcriptions, this map grows unboundedly during the session.

**Fix:** Add a max size (e.g., 50 entries, evict oldest) and clear the cache entry on delete.

### 2.3 `readConfig()` is called on every preview fetch

Line ~264: `const config = (await readConfig()) ?? {};`

This reads from disk on every cursor move (after debounce). Same issue in `handleDelete` (line ~283), `handleBatchDelete` (line ~311), `handleBatchExport` (line ~346). The config should be read once and cached, or `useApi`'s pattern (which also reads config per fetch) should be centralized into a context.

### 2.4 Preview summary truncated to 500 chars — arbitrary

Line ~273: `.slice(0, 500)`. This is a content-based limit stored in the cache. If the terminal resizes wider, the cached preview is still 500 chars. Not a bug, but a poor heuristic.

---

## 3. Search Implementation

### 3.1 Debounce applies only when `searchActive` is true

Lines ~198–205:
```ts
useEffect(() => {
  if (!searchActive) return;
  const timer = setTimeout(() => {
    setSearchValue(searchDraft);
    setPagination({ page: 1 });
  }, 300);
  return () => clearTimeout(timer);
}, [searchActive, searchDraft, setPagination]);
```

When the user presses Enter to submit search (line ~474), `setSearchActive(false)` is called, which means the debounce effect's guard `if (!searchActive) return` fires, and the cleanup clears the pending timer. But `onSubmit` also calls `setSearchValue(searchDraft)` directly. So there's a **race**: the debounce timer might fire *and* the submit handler fires, both setting `searchValue`. Since React batches state updates within event handlers but not across `setTimeout`, you could get:

1. Timer fires → `setSearchValue(searchDraft)` + `setPagination({page: 1})`
2. Submit handler → `setSearchValue(searchDraft)` + `setSearchActive(false)` + `setPagination({page: 1})`

In practice this is a no-op (same value set twice), but it's sloppy.

### 3.2 Client-side highlighting may mismatch server-side filtering

The server gets `q=<query>` and returns filtered results. The client then runs `fuzzyMatch()` for highlighting (lines ~221–228). If the server uses full-text search (stemming, synonyms, etc.) and the client uses character-level fuzzy matching, the highlighting won't match. A server result for "running" when searching "run" would get fuzzy-highlighted on "r", "u", "n" — three individual characters scattered in the word, rather than the prefix "run".

This is a fundamental design gap. Either the server should return match indices, or the client highlighting should use the same algorithm as the server.

### 3.3 Escape during search clears the filter — no way to dismiss the input without losing the query

Line ~397:
```ts
if (key.escape) {
  setSearchDraft("");
  setSearchValue("");
  setSearchActive(false);
  setPagination({ page: 1 });
}
```

If the user has an active search, opens the search input to modify it, then presses Escape wanting to cancel the *edit* (keep old filter), both draft and value are cleared. This is a UX gap, not a bug.

---

## 4. Keyboard Handling

### 4.1 Throttle at 50ms is too aggressive

Lines ~405–413:
```ts
if ((key.upArrow || lower === "k") && listItems.length > 0) {
  const now = Date.now();
  if (now - lastMoveRef.current < 50) return;
  lastMoveRef.current = now;
  setSelectedIndex((prev) => Math.max(0, prev - 1));
  return;
}
```

50ms = max 20 moves/sec. Terminal key repeat is typically 30–40 Hz. This means **roughly half the keystrokes are silently dropped** during held-key navigation. The user holds ↓ and the cursor moves at ~20 items/sec instead of ~33. It'll feel sluggish on long lists.

**Also:** The throttle is per-render, not per-direction. If you press ↑ then immediately ↓ within 50ms (unlikely but possible in automated testing), the second press is dropped.

### 4.2 `backspace` triggers `onBack()`

Line ~401:
```ts
if (key.escape || key.backspace) {
  onBack();
  return;
}
```

If the user is in a flow where they type something wrong (e.g., after a future text input is added), backspace would navigate away. Currently search mode returns early before this line, so it's fine. But it's fragile — any new text input mode must be added *above* this guard.

### 4.3 `g` and `G` don't use throttle

Lines ~446–453: `g` jumps to top, `G` jumps to bottom. These bypass the 50ms throttle. Rapidly pressing `g` would trigger re-renders on every keystroke (setting index to 0 repeatedly). Harmless but inconsistent.

### 4.4 No guard for actions during `isDeleting`/`isBatchDeleting`/`isBatchExporting`

While an async operation is in progress, the user can still press `d` to trigger another delete, `Enter` to navigate away, or `n/p` to change pages. The `handleDelete` callback will fire while a previous delete is still in-flight, causing concurrent mutations to `deletedIds`, `isDeleting`, etc.

**Fix:** Add an `isBusy` guard at the top of the input handler:
```ts
if (isDeleting || isBatchDeleting || isBatchExporting) return;
```

---

## 5. Layout/Height Calculations

### 5.1 `reservedRows` calculation is fragile

Lines ~286–294:
```ts
const reservedRows =
  6 +
  (searchActive ? 2 : searchValue ? 1 : 0) +
  (confirmDelete || confirmBatchDelete ? 1 : 0) +
  (isDeleting || isBatchDeleting || isBatchExporting ? 1 : 0) +
  (notice ? 1 : 0) +
  (error ? 1 : 0) +
  (loading && !data ? 1 : 0);
```

The base `6` is magic. The actual chrome consumed depends on Ink's layout engine, padding, margins, and outer components (Header, Footer). If any of those change, this number silently breaks. Items per page will be wrong — either clipped or leaving dead space.

**Also:** `marginBottom={1}` on each `ListRow` (line ~115) means each item is 3 rows (2 content lines + 1 margin). The calculation `itemHeight = 3` on line ~296 accounts for this, but the margin on the *last* visible item wastes a row.

### 5.2 Terminal rows < 10 breaks the layout

If `terminal.rows` is 8:
- `reservedRows` = 6 (minimum)
- `listHeight` = max(1, 8 - 6) = 2
- `itemsPerPage` = max(1, floor(2 / 3)) = max(1, 0) = 1

This works (shows 1 item), but barely. If any conditional row is active (search, notice, etc.), `reservedRows` = 7+, `listHeight` = 1, `itemsPerPage` = 1. The list is still functional but the UI would be a mess.

If `terminal.rows` ≤ 6, `listHeight` = 1, which might cause Ink to clip everything.

**Fix:** Add a minimum terminal size check and show a "terminal too small" message.

### 5.3 `availableRows` vs `listHeight` — two competing height systems

Line ~460: `const availableRows = terminal.rows - 4;` is used for the panel container height.  
Line ~295: `listHeight = Math.max(1, terminal.rows - reservedRows)` is used for windowing calculations.

These are *different* values. `availableRows` assumes 4 rows of chrome. `reservedRows` assumes 6+ rows. The container is taller than what the windowing logic thinks it can display, which means the container has empty space at the bottom that's never filled with list items. This is a layout mismatch.

### 5.4 `previewWidth` calculation doesn't match `SplitLayout`

Line ~530: `const previewWidth = Math.floor(terminal.columns * 0.6) - 2;`  
`SplitLayout` (line ~29): `const rightWidth = terminal.columns - leftWidth - 1;` where `leftWidth = Math.floor(terminal.columns * 0.4)`.

So `rightWidth = columns - floor(columns * 0.4) - 1`. For `columns = 120`: rightWidth = 120 - 48 - 1 = 71.  
But `previewWidth = floor(120 * 0.6) - 2 = 72 - 2 = 70`. Close but **off by one** due to rounding + separator. The markdown rendering width may not match the actual available width.

---

## 6. Memory Leaks

### 6.1 AbortController cleanup is correct ✅

The preview effect (lines ~239–284) returns a cleanup that clears the timer and aborts the controller. The `useApi` hook (line ~87) also aborts on unmount/dep change. No leak here.

### 6.2 `previewCacheRef` grows unboundedly

As noted in §2.2, the `Map` is never pruned. For a typical session browsing 100+ items, this holds 100+ analysis responses in memory. Not a "leak" (it's reachable), but it's unbounded growth.

### 6.3 `deletedIds` can accumulate if refresh fails

Lines ~292, ~304: After a successful delete + refresh, the ID is removed from `deletedIds`. But if `refresh()` throws (network error), the catch block does remove the ID (line ~297). So this is fine. ✅

However, if the component unmounts during the async delete operation, the state setters fire on an unmounted component. Ink/React will warn. `useApi` guards with `mountedRef`, but `handleDelete`/`handleBatchDelete`/`handleBatchExport` don't.

### 6.4 `useInput` is never cleaned up explicitly

Ink's `useInput` returns void and auto-cleans on unmount. Fine. ✅

### 6.5 The notice timer (line ~172) is properly cleaned up ✅

---

## 7. Bugs

### 7.1 `Hint` type is not imported

Line ~305:
```ts
const hints: Hint[] = [
```

The `Hint` type is defined in `Footer.tsx` but never imported in `TranscriptionList.tsx`. This either:
- Fails to compile (if `Hint` is not re-exported from somewhere), or
- Is resolved by a barrel export not shown here.

If this compiles, it's because of an ambient declaration or re-export. **Verify this.**

### 7.2 Batch delete is sequential, not parallel

Lines ~325–330:
```ts
for (const id of idsToDelete) {
  await apiFetch(`/v1/transcriptions/${id}`, {
    method: "DELETE",
    token,
    apiUrl,
  });
}
```

If the user selects 20 items and presses `D`, this fires 20 sequential HTTP requests. If one fails mid-way, the catch block **reverts all** `deletedIds` — including ones that were already successfully deleted on the server. The UI re-shows items that no longer exist server-side. The subsequent `refresh()` never runs.

**Fix:** Use `Promise.allSettled`, only revert the IDs that actually failed.

### 7.3 `handleBatchExport` doesn't check `isBatchExporting` guard

Line ~340: `handleBatchExport` can be triggered multiple times concurrently. Pressing `E` twice quickly starts two parallel export runs, potentially writing the same files concurrently.

### 7.4 `searchQuery` in preview effect dep causes unnecessary refetches

Line ~284:
```ts
}, [isWide, selectedItem?.id, searchQuery]);
```

`searchQuery` is a dependency. When the search changes, the preview effect re-runs even if `selectedItem?.id` hasn't changed (which can happen if the same item appears in both search results). This aborts the current fetch and re-fetches the same preview, only to get a cache hit immediately. Wasteful but not incorrect.

### 7.5 `E` key triggers export without confirmation

Line ~430:
```ts
if (input === "E") {
  void handleBatchExport();
  return;
}
```

Delete has a confirmation prompt. Export writes files to `process.cwd()` silently. If the user accidentally hits Shift+E, files appear in their directory with no undo.

### 7.6 `setInputActive` semantics may be inverted

Line ~193:
```ts
useEffect(() => {
  setInputActive(searchActive);
  return () => setInputActive(false);
}, [searchActive, setInputActive]);
```

Without seeing `InputContext`, the name `setInputActive` is ambiguous. If it means "an input field is active, lock other handlers" — then `setInputActive(true)` when `searchActive` is correct. But the cleanup sets `false` on unmount, which could conflict if another component also has an active input. This is a shared-global-state concern.

### 7.7 `prevPage` in `usePagination` doesn't clamp to 1

Line ~39 of `usePagination.ts`:
```ts
const prevPage = useCallback(() => {
  setPage((prev) => Math.max(prev - 1, 1));
}, []);
```

This is fine — it clamps to 1. ✅ But `nextPage` (line ~35):
```ts
const nextPage = useCallback(() => {
  setPage((prev) => Math.min(prev + 1, totalPages));
}, [totalPages]);
```

`totalPages` is a state variable. If `totalPages` hasn't been updated yet (still 1 from initial state) but the API returned `totalPages: 5`, pressing `n` won't advance past page 1 until the next render. This is a **real bug** — there's a frame where `totalPages` is stale because `setPagination({ total, totalPages })` (line ~215 of TranscriptionList) triggers a render, but `nextPage`'s closure captured the *previous* `totalPages`.

Actually, `nextPage` depends on `[totalPages]` so it will have the latest value... after the render. If the user presses `n` in the same render cycle where `totalPages` was just updated from the effect, the callback already has the new value because `useCallback` would have been re-created. This is fine in practice. ✅ (Withdrawing this one.)

---

## Summary of Severity

| # | Issue | Severity |
|---|-------|----------|
| 1.2 | `selectedItem` can be undefined for one render frame | Medium |
| 2.2 | Preview cache grows unboundedly, never invalidates | Medium |
| 3.2 | Client fuzzy highlight ≠ server search algorithm | Low (cosmetic) |
| 4.4 | No guard against actions during async operations | **High** |
| 5.3 | `availableRows` vs `reservedRows` mismatch | Medium |
| 5.4 | Preview width off-by-one vs SplitLayout | Low |
| 7.1 | `Hint` type possibly not imported | **High** (if it doesn't compile) |
| 7.2 | Batch delete reverts all on partial failure | **High** |
| 7.3 | Batch export can run concurrently | Medium |
| 7.5 | Export has no confirmation prompt | Low (UX) |

**Top 3 fixes I'd prioritize:**
1. Add `isBusy` guard to input handler (§4.4)
2. Fix batch delete partial-failure revert logic (§7.2)
3. Synchronous index clamping instead of effect-based (§1.2)

# TUI Fix Plan v0.9.2

## Issue 1: TranscriptionList infinite reloading loop
- [x] Only set `total` and `totalPages` from API response (not page/limit)
- [x] Remove config default limit useEffect (replace with one-time mount init)
- [x] Remove 30-second auto-refresh interval
- [x] Ensure useApi deps are primitives only

## Issue 2: No visual jumps/glitches
- [x] TranscriptionList: verify `loading && !data` pattern ✓ (already correct)
- [x] Dashboard: verify loading suppression with cache ✓ (already correct)
- [x] TranscriptionDetail: fix loading flash — use prevDataRef pattern

## Issue 3: Header user info
- [x] Add email/plan props to Header
- [x] Fetch /v1/usage once in App, pass to Header
- [x] Display `email · plan` in Header

## Build & Publish
- [x] Build: `bun run build`
- [x] Bump to 0.9.2
- [x] Commit
- [x] Publish
- [x] Push

# App Changes Needed for UX Features

## History Integration in TranscriptionDetail

The `addToHistory` function needs to be called when a transcription detail view loads.

### Option A: In TranscriptionDetail.tsx (preferred)

Add this import and effect to `TranscriptionDetail.tsx`:

```tsx
import { addToHistory } from "../../lib/history";
```

Add this effect after the `analysis` useMemo:

```tsx
// Track in local history when we have title data
useEffect(() => {
  if (analysis && title && title !== "Untitled" && id) {
    void addToHistory(id, title);
  }
}, [analysis, title, id]);
```

This is self-contained in TranscriptionDetail.tsx and doesn't require app.tsx changes.

### Note
The Dashboard already reads from history via `getHistory()` and shows "Recently viewed" when local history is available, falling back to API recent transcriptions otherwise.

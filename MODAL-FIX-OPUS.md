# Modal Overlay Fix — Analysis & Solution

## How Ink Rendering Works

### 2D Character Grid (Output class)
Ink's `Output` class (`output.js`) maintains a 2D array of styled characters, initialized with spaces. The `write(x, y, text)` method overwrites cells at specific coordinates. **Later writes overwrite earlier writes** — this is the key to overlays.

### Render Order
`renderNodeToOutput` walks the DOM tree depth-first, rendering children in order. For a parent box, each child is rendered sequentially. **Absolute-positioned children participate in the same render pass** — Yoga computes their position relative to the parent's top-left, and they render on top of earlier siblings because they come later in the write sequence.

### position="absolute"  
In `apply-styles.js`, `position: "absolute"` maps to `Yoga.POSITION_TYPE_ABSOLUTE`. This removes the element from flow but positions it relative to the **parent** box. The parent needs explicit dimensions (or flex-based dimensions) for the absolute child to know its bounds.

### backgroundColor
`renderBackground` fills the content area of a Box with colored spaces. This is how we create an opaque backdrop — spaces with a background color overwrite whatever was rendered before.

## The Problem

The current code wraps the modal in:
```tsx
<Box position="absolute" flexDirection="column" width="100%" height="100%">
  <AddUrlModal ... />
</Box>
```

Issues:
1. **No backdrop** — the absolute box is transparent (no backgroundColor), so the content underneath shows through
2. **Centering works** because AddUrlModal uses `alignItems="center" justifyContent="center"` with `width="100%" height="100%"`
3. **The parent box** (the content area) has `flexGrow={1}` which gives it dimensions — absolute positioning works

## Solution

### 1. ModalOverlay wrapper component
Create a reusable `ModalOverlay` that:
- Uses `position="absolute"` with full width/height
- Has a dim background color to create the "dimmed backdrop" effect
- Centers its children

### 2. The backdrop trick
Use a Box with `backgroundColor` set to a dark color (e.g., `"black"` or `"#111"`). Ink's `renderBackground` will fill it with colored spaces, overwriting the content underneath. This creates a proper opaque/semi-opaque backdrop.

Since Ink doesn't support transparency/alpha, we use a solid dark background. The terminal "dimmed" look comes from the contrast between the dark backdrop and the bright modal.

### 3. Implementation
- Create `src/tui/components/ModalOverlay.tsx` — generic overlay wrapper
- Modify `app.tsx` to use ModalOverlay
- Keep AddUrlModal mostly unchanged (it already centers itself)

## Key Insight
The original code was **almost right** — it just needed `backgroundColor` on the absolute-positioned wrapper to make it visually overlay. Without a background, absolute-positioned boxes in Ink are "transparent" — they only overwrite cells where they have actual text content.

## Changes Made

### 1. `src/tui/components/modal/Modal.tsx`
- Added `backgroundColor="#111111"` to the absolute-positioned overlay Box
- This makes Ink's `renderBackground` fill the entire overlay area with dark-colored spaces, creating an opaque backdrop
- The modal content (AddUrlModal) is centered via `alignItems="center" justifyContent="center"`

### 2. `src/tui/components/modal/AddUrlModal.tsx`
- Removed the outer centering `<Box>` wrapper (centering is now handled by Modal)
- Fixed import paths: files were moved to `modal/` subdirectory but imports still pointed to old locations (`../../lib/` → `../../../lib/`, `../context/` → `../../context/`, `../theme` → `../../theme`)

### 3. `src/tui/app.tsx`
- Fixed import paths: `./components/AddUrlModal` → `./components/modal/AddUrlModal`
- Added import for `Modal` component
- Replaced inline `<Box position="absolute">` wrapper with `<Modal>` component

### Build
All changes compile successfully: `bun run build` produces `dist/index.js` (1.33 MB).

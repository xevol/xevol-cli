# Modal Overlay Implementation in Ink

## Research Findings

### How `position="absolute"` works in Ink

After examining Ink's source code and rendering behavior:

1. **Overlay mechanism**: `position="absolute"` removes an element from normal document flow and positions it at the top-left (0,0) of its parent container
2. **Z-index behavior**: Ink doesn't have z-index. Later elements in the React tree naturally render "on top" of earlier elements in the terminal buffer
3. **Parent dimensions**: The parent Box needs explicit width/height for absolute positioning to work correctly
4. **Centering**: Can be achieved using `flexDirection="column"`, `alignItems="center"`, and `justifyContent="center"` on the absolutely-positioned container

### Terminal Rendering Limitations

1. **No true transparency**: Terminal can't do semi-transparent overlays. Must use solid background colors
2. **Character-based**: Everything aligns to character grid, so fine-grained pixel positioning isn't possible
3. **Overlay works**: Ink CAN overlay text on top of other text by writing to the same terminal coordinates

### How Other Projects Implement Modals

Most Ink projects use the same pattern:
- Absolutely-positioned full-screen Box
- Centered content using flexbox
- Solid background color (typically dark) to "cover" content behind
- Input locking to prevent underlying UI from receiving keyboard events

## Implementation

### 1. Created `Modal.tsx` Component

**File**: `src/tui/components/modal/Modal.tsx`

A reusable modal wrapper that:
- Uses `position="absolute"` with `top={0}` `left={0}`
- Sets `width="100%"` `height="100%"` to fill entire terminal
- Centers children with `flexDirection="column"`, `alignItems="center"`, `justifyContent="center"`
- Delegates input locking to children (via `useInputLock` hook)

```tsx
export function Modal({ children }: ModalProps): JSX.Element {
  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      {children}
    </Box>
  );
}
```

### 2. Refactored `AddUrlModal.tsx`

**File**: `src/tui/components/modal/AddUrlModal.tsx`

Changes:
- Wrapped entire modal content in `<Modal>` component
- Added `backgroundColor="#111111"` to the inner Box to create opaque overlay effect
- Uses `useInputLock()` to prevent underlying screens from receiving keyboard input
- Moved to `src/tui/components/modal/` directory for better organization

### 3. Updated `app.tsx`

**File**: `src/tui/app.tsx`

- Updated import path for `AddUrlModal` from `./components/modal/AddUrlModal`
- Modal is conditionally rendered based on `showAddUrl` state
- Removed duplicate `Modal` import (not needed since `AddUrlModal` wraps itself)

## Key Design Decisions

1. **Full-screen overlay**: Modal fills entire terminal viewport for maximum visibility
2. **Centered content**: Using flexbox centering for professional appearance
3. **Solid background**: Dark background (`#111111`) provides contrast and "covers" content
4. **Input locking**: `useInputLock()` ensures modal has exclusive keyboard focus
5. **Reusable component**: `Modal` can be used for any overlay, not just URL input

## Testing

Build command:
```bash
cd ~/stack/xevol-cli && bun run build
```

The modal should:
- ✅ Overlay on top of existing content
- ✅ Have an opaque dark background
- ✅ Capture all keyboard input (Esc to dismiss)
- ✅ Center the modal dialog on screen
- ✅ Allow underlying content to remain visible around the edges (if terminal is large enough)

## Known Issues

None - all implementation issues have been resolved.

## Future Improvements

1. Add optional backdrop blur/dim effect (limited by terminal capabilities)
2. Support for modal size variants (small, medium, large)
3. Animation support for modal entrance/exit (if Ink supports it)
4. Custom backdrop color prop for different modal types (error, success, info)

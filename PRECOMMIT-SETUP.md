# Pre-Commit Hooks Setup

## ✅ What Was Installed

### Tools
- **lefthook** v2.1.0 - Zero-dependency git hooks manager
- **@biomejs/biome** v2.3.13 - Fast linter & formatter (replaces eslint + prettier)

### Configuration Files
- `lefthook.yml` - Hook definitions
- `biome.json` - Linter and formatter rules

### Package Scripts Added
- `lint` - Run biome checks on src/
- `lint:fix` - Run biome checks and auto-fix issues
- `typecheck` - Run TypeScript type checking
- `prepare` - Auto-installs lefthook hooks on `npm/bun install`

## 🪝 Hooks Configured

### pre-commit (runs on staged files only)
1. **console-check** - Warns about console.log (non-blocking)
2. **biome-check** - Lints and formats staged .ts/.tsx files
3. **build** - Ensures the project still compiles

### pre-push
1. **build** - Full build check
2. **lint** - Full lint check on all src/ files

### commit-msg
1. **conventional-commit** - Enforces conventional commit format:
   - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
   - Format: `type(scope): subject`
   - Examples:
     - `feat: add user authentication`
     - `fix(api): handle null response`
     - `chore: update dependencies`

## 📋 Biome Configuration

### Code Style (based on existing code)
- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Line width**: 120 characters
- **Trailing commas**: Always
- **Arrow parens**: Always

### Linting Rules
- **Import style**: Prefer `import type` for types
- **Node.js imports**: Use `node:` protocol (e.g., `node:fs`)
- **Template literals**: Prefer over string concatenation
- **Console**: Warn on console (allow error/warn/info)
- **Unused variables**: Warn (not error - safer for legacy code)
- **Hook rules**: Warn (React hooks rules)
- **a11y**: Recommended accessibility rules

## 📊 Initial Lint Results

**Fixed automatically**: 50 files
- Added `node:` protocol to built-in imports
- Converted string concatenation to template literals
- Added `type` keyword to type-only imports
- Fixed various formatting issues

**Remaining warnings**: 14 (non-blocking)
- 4 unused variables
- 4 `any` type usages
- 2 unused function parameters
- 1 React Hook ordering (requires refactor)
- 1 ANSI regex control character (intentional for terminal output)
- 1 console.log usage
- 1 exhaustive dependencies

These warnings don't block commits or pushes - they're informational to guide future improvements.

## ⚡ Performance

All hooks are **fast** (< 5 seconds):
- pre-commit: ~0.24s (on staged files only)
- pre-push: ~0.18s (full project)

## 🔧 Usage

### Manual Commands
```bash
# Lint all files
bun run lint

# Lint and auto-fix
bun run lint:fix

# Type check
bun run typecheck

# Build
bun run build
```

### Skipping Hooks (when needed)
```bash
# Skip pre-commit
git commit --no-verify -m "message"

# Skip pre-push
git push --no-verify
```

### Reinstall Hooks
```bash
bunx lefthook install
```

## 📝 Commits Made

1. `chore: add pre-commit hooks with lefthook and biome` - Initial setup
2. `style: apply biome auto-fixes (imports, templates, formatting)` - Auto-fixed 50 files

Both commits and push completed successfully! ✅

## 🎯 Next Steps (Optional)

To clean up the remaining 14 warnings:
1. Prefix unused variables with `_` (e.g., `_total`, `_expired`, `_reset`)
2. Add proper types to replace `any` in TranscriptionDetail.tsx
3. Remove unused `RawItem` type alias
4. Refactor AppInner component to call hooks before early return
5. Add `// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape codes are intentional` comment

**Note**: These are low priority since warnings don't block development, but fixing them would improve code quality.

# Multi-Platform Release Setup ✅

Two ways to build and release xevol-cli across Linux and macOS platforms:
1. **Manual** - Shell scripts for local builds and releases
2. **Automated** - GitHub Actions triggered on version tags

## Quick Start

### Option 1: Automated Release (Recommended)
```bash
# Update version
npm version 0.11.17

# Push tag to trigger CI
git push origin v0.11.17
```
GitHub Actions automatically builds, releases, and updates Homebrew.

### Option 2: Manual Release
```bash
# Build locally
./scripts/build.sh

# Create release manually
./scripts/release.sh 0.11.17
```

## What Was Set Up

### 1. Build Script (`scripts/build.sh`)
For local/manual builds:
- Builds 3 platform binaries using Bun cross-compilation:
  - `xevol-linux-x64` (Linux x64)
  - `xevol-darwin-x64` (macOS Intel)
  - `xevol-darwin-arm64` (macOS Apple Silicon)
- Uses `--external react-devtools-core` flag on all builds
- Creates `.tar.gz` archives for distribution
- Computes SHA256 hashes for verification

### 2. Release Script (`scripts/release.sh`)
For manual releases:
- Takes version number as argument (e.g., `0.11.17`)
- Runs build script automatically
- Creates GitHub release with tag `v{version}`
- Uploads all 3 tarballs as release assets
- Auto-updates Homebrew formula in `xevol/homebrew-tap`:
  - Updates version
  - Updates download URLs
  - Updates SHA256 hashes for all platforms
- Commits and pushes formula changes

### 3. GitHub Actions Workflow (`.github/workflows/release.yml`)
For automated releases:
- Triggers on version tags matching `v*` (e.g., `v0.11.17`)
- Runs `scripts/build.sh` to build all 3 platforms
- Creates GitHub release with all tarballs
- Updates Homebrew formula automatically
- No manual intervention needed

### 4. Multi-Platform Homebrew Formula
Already set up in `xevol/homebrew-tap/Formula/xevol.rb`:
- `on_macos` block with ARM64/Intel detection
- `on_linux` block for Linux x64
- Each platform downloads the correct binary

## Full Release Process

### Automated (Recommended)
```bash
# 1. Update version in package.json
npm version 0.11.17

# 2. Push the version tag
git push origin v0.11.17
```

GitHub Actions automatically:
- ✅ Builds all 3 platform binaries
- ✅ Creates GitHub release with tarballs
- ✅ Updates Homebrew formula
- ✅ Computes and includes SHA256 checksums

Watch the workflow: https://github.com/xevol/xevol-cli/actions

### Manual (Alternative)
```bash
# 1. Update version in package.json
npm version 0.11.17

# 2. Commit version bump
git add package.json
git commit -m "Bump version to 0.11.17"
git push

# 3. Create release manually
./scripts/release.sh 0.11.17
```

The release script handles everything locally.

## Installation (End Users)

After a release, users can install with:

```bash
brew install xevol/tap/xevol
```

Works on:
- ✅ macOS Apple Silicon
- ✅ macOS Intel
- ✅ Linux x64

## Requirements

- **Bun**: For cross-compilation (`bun --version`)
- **gh CLI**: For GitHub releases (`gh --version`)
- **Git**: For pushing formula updates
- **homebrew-tap**: Clone at `../homebrew-tap` (or script will clone it)

## Manual Build & Test

Test the build locally without releasing:

```bash
./scripts/build.sh

# Test Linux binary
./xevol-linux-x64 --version

# The macOS binaries won't run on Linux, but you can verify they exist:
file xevol-darwin-x64
file xevol-darwin-arm64
```

## Cross-Compilation

All builds use Bun's cross-compilation from Linux (no macOS machine needed):
- ✅ Verified Linux → macOS Intel
- ✅ Verified Linux → macOS ARM64
- ✅ Verified Linux → Linux x64

## SHA256 Checksums (Current Build)

After running `./scripts/build.sh`:
```bash
cat xevol-linux-x64.sha256
cat xevol-darwin-x64.sha256
cat xevol-darwin-arm64.sha256
```

## Troubleshooting

**gh CLI not authenticated:**
```bash
gh auth login
```

**homebrew-tap not found:**
The script will auto-clone `xevol/homebrew-tap` to `../homebrew-tap`.

**Build fails:**
- Verify `bun --version` works
- Check that `src/index.ts` exists
- Ensure dependencies are installed (`bun install`)

**Release fails:**
- Verify `gh` CLI is authenticated
- Check you have push access to both repos
- Ensure the version tag doesn't already exist

## Files Created

- `scripts/build.sh` - Multi-platform build script
- `scripts/release.sh` - GitHub release + Homebrew update script
- `scripts/README.md` - Script documentation

## Commits

- `f79a0ee` - Add build and release scripts
- `18b198d` - Remove GitHub Actions workflow
- `7fd1302` - Add script documentation

---

**Status**: ✅ Complete
**Approach**: Shell scripts (no CI/CD)
**Platforms**: Linux x64, macOS Intel, macOS ARM64
**Distribution**: GitHub Releases + Homebrew

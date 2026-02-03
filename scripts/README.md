# Build & Release Scripts

Simple shell scripts for building and releasing xevol-cli across multiple platforms.

## Scripts

### `build.sh`
Builds standalone binaries for all supported platforms using Bun cross-compilation.

**Platforms:**
- Linux x64 (`xevol-linux-x64`)
- macOS Intel (`xevol-darwin-x64`)
- macOS Apple Silicon (`xevol-darwin-arm64`)

**Usage:**
```bash
./scripts/build.sh
```

**Output:**
- 3 standalone binaries
- 3 tarballs (`.tar.gz`)
- 3 SHA256 checksum files (`.sha256`)

### `release.sh`
Creates a GitHub release and updates the Homebrew formula.

**Requirements:**
- `gh` CLI must be installed and authenticated
- `../homebrew-tap` repo must exist (or will be cloned)

**Usage:**
```bash
./scripts/release.sh <version>
```

**Example:**
```bash
./scripts/release.sh 0.11.17
```

**What it does:**
1. Runs `build.sh` to build all binaries
2. Creates GitHub release with tag `v{version}`
3. Uploads all 3 tarballs to the release
4. Updates `xevol/homebrew-tap/Formula/xevol.rb` with new URLs and SHA256 hashes
5. Commits and pushes the formula update

## Full Release Process

```bash
# 1. Update version in package.json
npm version 0.11.17

# 2. Commit the version bump
git add package.json
git commit -m "Bump version to 0.11.17"
git push

# 3. Run the release script
./scripts/release.sh 0.11.17

# 4. Done! Users can now install with:
brew install xevol/tap/xevol
```

## Manual Build Only

If you just want to build locally without creating a release:

```bash
./scripts/build.sh
```

The binaries will be in the project root:
- `xevol-linux-x64`
- `xevol-darwin-x64`
- `xevol-darwin-arm64`

## Cross-Compilation

All builds use Bun's built-in cross-compilation feature, so you can build all 3 platforms from a Linux machine (no macOS required).

The builds include `--external react-devtools-core` to avoid bundling issues with the `ink` React TUI library.

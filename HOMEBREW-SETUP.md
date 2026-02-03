# Homebrew Setup for Xevol CLI

## Completed Steps

### 1. Fixed Compilation Issue
- Modified `src/index.ts` to use a static version import instead of `createRequire`
- Created `src/version.ts` with the current version (0.11.16)
- This fixed the `bun build --compile` compatibility issue

### 2. Created GitHub Repositories
- **xevol/xevol-cli**: Standalone repo for the CLI tool
  - URL: https://github.com/xevol/xevol-cli
  - Initial commit with all source code
  - Tagged as v0.11.16

- **xevol/homebrew-tap**: Official Homebrew tap
  - URL: https://github.com/xevol/homebrew-tap
  - Contains Formula/xevol.rb

### 3. Built and Released Binary
- Compiled Linux x64 binary using `bun build --compile`
- Created tarball: `xevol-0.11.16-linux-x64.tar.gz`
- SHA256: `e44d2788bc7b6be6e89fb0840f051d99016e152dbbfe2b435318301d7ccc7e10`
- Published as GitHub release: https://github.com/xevol/xevol-cli/releases/tag/v0.11.16

### 4. Created Homebrew Formula
- Formula location: `Formula/xevol.rb`
- Installs both `xevol` and `xvl` commands (symlink)
- Includes version and help tests
- Linux x64 only (dependency specified)

### 5. Tested Installation
```bash
brew tap xevol/tap
brew install xevol
xevol --version  # ✓ Works: 0.11.16
xvl --help       # ✓ Works: Shows help
brew test xevol  # ✓ Passes
```

## Installation Instructions

### For Linux (x64)
```bash
brew tap xevol/tap
brew install xevol
```

### For macOS and Other Platforms
Use npm:
```bash
npm install -g xevol
```

## Current Limitations

### 1. macOS Binary Not Included
- `bun build --compile` only compiles for the host platform
- We compiled on Linux, so only Linux x64 binary is available
- macOS users must use npm for now

### 2. To Add macOS Support
Need to compile on a macOS system:

```bash
# On macOS (Intel)
bun build ./src/index.ts --compile --outfile xevol-macos-x64

# On macOS (Apple Silicon)
bun build ./src/index.ts --compile --outfile xevol-macos-arm64
```

Then:
1. Create tarballs and get SHA256 hashes
2. Update formula to support multiple platforms using `on_macos` and `on_linux` blocks
3. Upload to the same GitHub release

### Example multi-platform formula structure:
```ruby
class Xevol < Formula
  desc "..."
  homepage "..."
  version "0.11.16"
  license "UNLICENSED"

  on_linux do
    on_intel do
      url "https://github.com/xevol/xevol-cli/releases/download/v0.11.16/xevol-0.11.16-linux-x64.tar.gz"
      sha256 "e44d2788bc7b6be6e89fb0840f051d99016e152dbbfe2b435318301d7ccc7e10"
    end
  end

  on_macos do
    on_intel do
      url "https://github.com/xevol/xevol-cli/releases/download/v0.11.16/xevol-0.11.16-macos-x64.tar.gz"
      sha256 "HASH_HERE"
    end
    on_arm do
      url "https://github.com/xevol/xevol-cli/releases/download/v0.11.16/xevol-0.11.16-macos-arm64.tar.gz"
      sha256 "HASH_HERE"
    end
  end

  def install
    # Install appropriate binary based on platform
    if OS.mac?
      if Hardware::CPU.intel?
        bin.install "xevol-macos-x64" => "xevol"
      else
        bin.install "xevol-macos-arm64" => "xevol"
      end
    else
      bin.install "xevol-linux-x64" => "xevol"
    end
    bin.install_symlink "xevol" => "xvl"
  end

  test do
    assert_match "0.11.16", shell_output("#{bin}/xevol --version")
    assert_match "Xevol is a tool", shell_output("#{bin}/xevol --help")
  end
end
```

## Updating the Formula for New Releases

1. Build the binary:
   ```bash
   cd ~/stack/xevol-cli
   # Update version in src/version.ts and package.json
   bun build ./src/index.ts --compile --outfile xevol-linux-x64
   ```

2. Create tarball and get hash:
   ```bash
   tar -czf xevol-VERSION-linux-x64.tar.gz xevol-linux-x64
   sha256sum xevol-VERSION-linux-x64.tar.gz
   ```

3. Create GitHub release:
   ```bash
   git tag vVERSION
   git push origin vVERSION
   gh release create vVERSION --title "Xevol CLI vVERSION" --notes "..." xevol-VERSION-linux-x64.tar.gz
   ```

4. Update Formula/xevol.rb:
   - Update `version` field
   - Update `url` to point to new release
   - Update `sha256` hash

5. Commit and push:
   ```bash
   cd ~/stack/homebrew-tap
   git add Formula/xevol.rb
   git commit -m "Update xevol to vVERSION"
   git push
   ```

## Files Changed in xevol-cli

- `src/index.ts`: Removed `createRequire`, now imports from `./version`
- `src/version.ts`: New file with version constant (needs manual updates)
- `.gitignore`: Updated to exclude build artifacts and binaries

## Note on Version Management

The version is now in two places:
1. `package.json` - for npm publishing
2. `src/version.ts` - for compiled binary

When bumping version, update both files to keep them in sync.

Consider automating this with a script:
```bash
#!/bin/bash
VERSION=$1
sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
echo "export const version = \"$VERSION\";" > src/version.ts
git add package.json src/version.ts
git commit -m "Bump version to $VERSION"
```

## Resources

- Homebrew Tap Repo: https://github.com/xevol/homebrew-tap
- CLI Repo: https://github.com/xevol/xevol-cli
- Latest Release: https://github.com/xevol/xevol-cli/releases/latest
- npm Package: https://www.npmjs.com/package/xevol

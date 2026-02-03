#!/bin/bash
set -e

# Check for version argument
if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh <version>"
  echo "Example: ./scripts/release.sh 0.11.17"
  exit 1
fi

VERSION=$1
TAG="v${VERSION}"

echo "🚀 Creating release for version ${VERSION}..."

# Build all binaries
echo "📦 Step 1: Building binaries..."
./scripts/build.sh

# Read SHA256 hashes
SHA_LINUX=$(cat xevol-linux-x64.sha256)
SHA_DARWIN_X64=$(cat xevol-darwin-x64.sha256)
SHA_DARWIN_ARM64=$(cat xevol-darwin-arm64.sha256)

# Create GitHub release
echo ""
echo "📦 Step 2: Creating GitHub release ${TAG}..."
gh release create "${TAG}" \
  xevol-linux-x64.tar.gz \
  xevol-darwin-x64.tar.gz \
  xevol-darwin-arm64.tar.gz \
  --title "Xevol CLI ${TAG}" \
  --notes "## Xevol CLI ${VERSION}

### Installation

**Homebrew (macOS/Linux):**
\`\`\`bash
brew install xevol/tap/xevol
\`\`\`

**Manual download:**
Choose the right binary for your platform:
- **Linux x64**: \`xevol-linux-x64.tar.gz\`
- **macOS Intel**: \`xevol-darwin-x64.tar.gz\`
- **macOS Apple Silicon**: \`xevol-darwin-arm64.tar.gz\`

Extract and run:
\`\`\`bash
tar -xzf xevol-*.tar.gz
./xevol-* --version
\`\`\`

### Platform Support
✅ Linux x64 (standalone binary)
✅ macOS Intel (standalone binary)
✅ macOS Apple Silicon (standalone binary)

---
**SHA256 Checksums:**
- Linux x64: \`${SHA_LINUX}\`
- macOS x64: \`${SHA_DARWIN_X64}\`
- macOS ARM64: \`${SHA_DARWIN_ARM64}\`
"

# Update Homebrew formula
echo ""
echo "📦 Step 3: Updating Homebrew formula..."

# Check if homebrew-tap exists
if [ ! -d "../homebrew-tap" ]; then
  echo "⚠️  homebrew-tap not found at ../homebrew-tap"
  echo "   Cloning xevol/homebrew-tap..."
  cd ..
  git clone https://github.com/xevol/homebrew-tap.git
  cd xevol-cli
fi

# Update formula
cat > ../homebrew-tap/Formula/xevol.rb <<EOF
class Xevol < Formula
  desc "Command-line tool to consume, remix, make, publish, and offer systems, products, and workflows"
  homepage "https://xevol.com"
  version "${VERSION}"
  license "UNLICENSED"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/xevol/xevol-cli/releases/download/${TAG}/xevol-darwin-arm64.tar.gz"
      sha256 "${SHA_DARWIN_ARM64}"
    else
      url "https://github.com/xevol/xevol-cli/releases/download/${TAG}/xevol-darwin-x64.tar.gz"
      sha256 "${SHA_DARWIN_X64}"
    end
  end

  on_linux do
    depends_on arch: :x86_64
    url "https://github.com/xevol/xevol-cli/releases/download/${TAG}/xevol-linux-x64.tar.gz"
    sha256 "${SHA_LINUX}"
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "xevol-darwin-arm64" => "xevol"
      else
        bin.install "xevol-darwin-x64" => "xevol"
      end
    else
      bin.install "xevol-linux-x64" => "xevol"
    end
    # Create xvl symlink (alias)
    bin.install_symlink "xevol" => "xvl"
  end

  test do
    assert_match "${VERSION}", shell_output("#{bin}/xevol --version")
    assert_match "Xevol is a tool", shell_output("#{bin}/xevol --help")
  end
end
EOF

# Commit and push Homebrew formula
cd ../homebrew-tap
git add Formula/xevol.rb
git commit -m "Update xevol to ${VERSION}"
git push
cd ../xevol-cli

echo ""
echo "✅ Release ${TAG} complete!"
echo ""
echo "🔗 GitHub Release: https://github.com/xevol/xevol-cli/releases/tag/${TAG}"
echo "🍺 Homebrew: brew install xevol/tap/xevol"
echo ""
echo "📋 SHA256 Checksums:"
echo "  Linux x64:    ${SHA_LINUX}"
echo "  macOS x64:    ${SHA_DARWIN_X64}"
echo "  macOS ARM64:  ${SHA_DARWIN_ARM64}"

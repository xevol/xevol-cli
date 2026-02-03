#!/bin/bash
set -e

echo "🔨 Building xevol-cli for all platforms..."

# Clean previous builds
rm -f xevol-linux-x64 xevol-darwin-x64 xevol-darwin-arm64
rm -f xevol-*.tar.gz xevol-*.sha256

# Build Linux x64
echo "📦 Building Linux x64..."
bun build --compile src/index.ts \
  --outfile xevol-linux-x64 \
  --target=bun-linux-x64 \
  --external react-devtools-core

# Build macOS x64
echo "📦 Building macOS x64..."
bun build --compile src/index.ts \
  --outfile xevol-darwin-x64 \
  --target=bun-darwin-x64 \
  --external react-devtools-core

# Build macOS ARM64
echo "📦 Building macOS ARM64..."
bun build --compile src/index.ts \
  --outfile xevol-darwin-arm64 \
  --target=bun-darwin-arm64 \
  --external react-devtools-core

# Make executable
chmod +x xevol-linux-x64 xevol-darwin-x64 xevol-darwin-arm64

# Create tarballs
echo "📦 Creating tarballs..."
tar -czf xevol-linux-x64.tar.gz xevol-linux-x64
tar -czf xevol-darwin-x64.tar.gz xevol-darwin-x64
tar -czf xevol-darwin-arm64.tar.gz xevol-darwin-arm64

# Compute SHA256 hashes
echo "🔐 Computing SHA256 hashes..."
sha256sum xevol-linux-x64.tar.gz | awk '{print $1}' > xevol-linux-x64.sha256
sha256sum xevol-darwin-x64.tar.gz | awk '{print $1}' > xevol-darwin-x64.sha256
sha256sum xevol-darwin-arm64.tar.gz | awk '{print $1}' > xevol-darwin-arm64.sha256

echo ""
echo "✅ Build complete!"
echo ""
echo "📋 SHA256 Checksums:"
echo "  Linux x64:    $(cat xevol-linux-x64.sha256)"
echo "  macOS x64:    $(cat xevol-darwin-x64.sha256)"
echo "  macOS ARM64:  $(cat xevol-darwin-arm64.sha256)"
echo ""
echo "📦 Tarballs:"
ls -lh xevol-*.tar.gz

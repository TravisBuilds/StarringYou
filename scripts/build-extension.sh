#!/bin/bash
#
# Build StarringYou Extension with bundled code
#

set -e

cd "$(dirname "$0")/.."

echo "🔨 Building StarringYou Extension..."

# Clean previous build
rm -rf extension-build
mkdir -p extension-build

# Copy extension structure
cp -r extension/* extension-build/

# Copy MediaPipe assets (already in extension/)
echo "✓ MediaPipe assets copied"

# Copy necessary source files for bundling
mkdir -p extension-build/lib
cp -r src/types extension-build/lib/
cp -r src/utils extension-build/lib/
cp -r src/enrollment extension-build/lib/
cp -r src/swap extension-build/lib/

echo "✓ Source files copied"

# Note: In a real build, we'd use webpack/esbuild to bundle TypeScript
# For now, we'll work with the structure as-is since we need quick iteration

echo "✓ Extension built to extension-build/"
echo ""
echo "Next: Load extension-build/ in Chrome (chrome://extensions)"

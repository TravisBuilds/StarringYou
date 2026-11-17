#!/bin/bash
set -e

echo "🔨 Building StarringYou extension package..."

# Build extension bundles
echo "📦 Building extension bundles..."
npm run build:extension

# Fix onboarding HTML location (Vite preserves directory structure)
if [ -f "extension/onboarding/extension-src/onboarding/onboarding.html" ]; then
  mv extension/onboarding/extension-src/onboarding/onboarding.html extension/onboarding/
fi

# Fix script path in onboarding.html
sed -i 's|src="../../onboarding.js"|src="./onboarding.js"|g' extension/onboarding/onboarding.html

# Remove ALL duplicate/unneeded folders before zipping
rm -rf extension/onboarding/extension-src
rm -rf extension/dist/mediapipe extension/dist/sample-images
rm -rf extension/onboarding/mediapipe extension/onboarding/sample-images extension/onboarding/models
rm -rf extension/dist/models

# Create zip (only include offscreen.js from dist, not the whole dist folder)
echo "📦 Creating extension zip..."
cd extension
zip -r ../starringyou-extension.zip \
  manifest.json \
  background/ \
  content/ \
  popup/ \
  onboarding/ \
  icons/ \
  mediapipe/ \
  dist/offscreen.js \
  -x "*.DS_Store" \
  -x "*/.*" \
  -x "dist/mediapipe/*" \
  -x "dist/sample-images/*" \
  -x "onboarding/mediapipe/*" \
  -x "onboarding/sample-images/*" \
  -x "onboarding/models/*"

cd ..
echo "✅ Extension package created: starringyou-extension.zip"
ls -lh starringyou-extension.zip

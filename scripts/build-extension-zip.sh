#!/bin/bash
set -e

echo "🔨 Building StarringYou extension package..."

# Build offscreen bundle
echo "📦 Building offscreen bundle..."
npm run build:offscreen

# Remove duplicates from dist AFTER build
rm -rf extension/dist/mediapipe extension/dist/sample-images

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
  -x "dist/sample-images/*"

cd ..
echo "✅ Extension package created: starringyou-extension.zip"
ls -lh starringyou-extension.zip

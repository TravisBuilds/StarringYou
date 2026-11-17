#!/bin/bash
set -e

echo "🔨 Building StarringYou extension package..."

# Build offscreen bundle
echo "📦 Building offscreen bundle..."
npm run build:offscreen

# Create zip
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
  dist/ \
  -x "*.DS_Store" \
  -x "*/.*"

cd ..
echo "✅ Extension package created: starringyou-extension.zip"
ls -lh starringyou-extension.zip

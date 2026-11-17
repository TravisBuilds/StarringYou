#!/bin/bash
#
# Package StarringYou Chrome Extension
# Creates a zip file ready to load in Chrome

cd "$(dirname "$0")/.."

# Create output directory
mkdir -p /cursor/stores/self

# Remove old zip if exists
rm -f /cursor/stores/self/starringyou-extension.zip

# Create zip (excluding development files)
cd extension
zip -r /cursor/stores/self/starringyou-extension.zip . \
  -x "*.DS_Store" \
  -x "*/node_modules/*" \
  -x "*/.git/*"

cd ..

echo "✓ Extension packaged to /cursor/stores/self/starringyou-extension.zip"
ls -lh /cursor/stores/self/starringyou-extension.zip

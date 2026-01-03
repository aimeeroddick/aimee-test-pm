#!/bin/bash
# Build Trackli Desktop App for macOS
# Run this script from the Trackli project root

set -e

echo "🚀 Building Trackli Desktop App..."
echo ""

# Build the web app with Electron flag
echo "📦 Building web app..."
npx cross-env ELECTRON=true vite build

echo ""
echo "🔨 Building Electron app..."
npx electron-builder --mac

echo ""
echo "✅ Build complete!"
echo ""
echo "Your app is in the 'release' folder:"
ls -la release/

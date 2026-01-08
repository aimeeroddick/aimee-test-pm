#!/bin/bash
# Generate PNG files from SVG logos
# Run from: ~/Desktop/Trackli/public/

cd "$(dirname "$0")"

echo "Generating PNG files from SVGs..."

# Favicon icons - use sips for proper PNG generation from favicon.svg
for size in 16 32 64 80 128; do
  sips -s format png -z $size $size favicon.svg --out icon-$size.png 2>/dev/null
  echo "Created icon-$size.png from favicon.svg"
done

# logo.png (56x56) - transparent, use logo.svg
sips -s format png -z 56 56 logo.svg --out logo.png 2>/dev/null
echo "Created logo.png"

# logo-full.png (200 width)
sips -s format png -z 200 200 logo-full.svg --out logo-full.png 2>/dev/null
echo "Created logo-full.png"

# apple-touch-icon (180x180) - USE PWA VERSION WITH BACKGROUND
sips -s format png -z 180 180 logo-pwa.svg --out apple-touch-icon.png 2>/dev/null
echo "Created apple-touch-icon.png (with background)"

# PWA icons (in /icons/ folder) - USE PWA VERSION WITH BACKGROUND
echo ""
echo "Generating PWA icons with background..."
mkdir -p icons

for size in 72 96 128 144 152 192 384 512; do
  sips -s format png -z $size $size logo-pwa.svg --out icons/icon-${size}x${size}.png 2>/dev/null
  echo "Created icons/icon-${size}x${size}.png"
done

echo ""
echo "Done! PNG files generated."
echo "- Favicon icons: from favicon.svg (transparent)"
echo "- PWA/touch icons: from logo-pwa.svg (light background)"

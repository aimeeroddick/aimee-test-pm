#!/bin/bash
# Generate PNG files from SVG logos
# Run from: ~/Desktop/Trackli/public/

cd "$(dirname "$0")"

echo "Generating PNG files from SVGs..."

# Favicon icons - use favicon.svg (optimized for small sizes, transparent)
for size in 16 32 64 80 128; do
  qlmanage -t -s $size -o . favicon.svg 2>/dev/null
  mv favicon.svg.png icon-$size.png 2>/dev/null
  echo "Created icon-$size.png from favicon.svg"
done

# logo.png (56x56) - transparent, use logo.svg
qlmanage -t -s 56 -o . logo.svg 2>/dev/null
mv logo.svg.png logo.png 2>/dev/null
echo "Created logo.png"

# logo-full.png (200 width)
qlmanage -t -s 200 -o . logo-full.svg 2>/dev/null
mv logo-full.svg.png logo-full.png 2>/dev/null
echo "Created logo-full.png"

# apple-touch-icon (180x180) - USE PWA VERSION WITH BACKGROUND
qlmanage -t -s 180 -o . logo-pwa.svg 2>/dev/null
mv logo-pwa.svg.png apple-touch-icon.png 2>/dev/null
echo "Created apple-touch-icon.png (with background)"

# PWA icons (in /icons/ folder) - USE PWA VERSION WITH BACKGROUND
echo ""
echo "Generating PWA icons with background..."
mkdir -p icons

for size in 72 96 128 144 152 192 384 512; do
  qlmanage -t -s $size -o . logo-pwa.svg 2>/dev/null
  mv logo-pwa.svg.png icons/icon-${size}x${size}.png 2>/dev/null
  echo "Created icons/icon-${size}x${size}.png"
done

echo ""
echo "Done! PNG files generated."
echo "- Favicon icons: from favicon.svg (transparent)"
echo "- PWA/touch icons: from logo-pwa.svg (light background)"

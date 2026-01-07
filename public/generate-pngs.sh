#!/bin/bash
# Generate PNG files from SVG logos
# Run from: ~/Desktop/Trackli/public/

cd "$(dirname "$0")"

echo "Generating PNG files from SVGs..."

# Use qlmanage (built into macOS) to convert SVG to PNG
# logo.svg -> various sizes
for size in 16 32 64 80 128; do
  qlmanage -t -s $size -o . logo.svg 2>/dev/null
  mv logo.svg.png icon-$size.png 2>/dev/null
  echo "Created icon-$size.png"
done

# logo.png (56x56)
qlmanage -t -s 56 -o . logo.svg 2>/dev/null
mv logo.svg.png logo.png 2>/dev/null
echo "Created logo.png"

# apple-touch-icon (180x180)
qlmanage -t -s 180 -o . logo.svg 2>/dev/null
mv logo.svg.png apple-touch-icon.png 2>/dev/null
echo "Created apple-touch-icon.png"

# logo-full.png (200 width)
qlmanage -t -s 200 -o . logo-full.svg 2>/dev/null
mv logo-full.svg.png logo-full.png 2>/dev/null
echo "Created logo-full.png"

echo ""
echo "Done! PNG files generated."
echo "Note: og-image.png needs to be downloaded separately (1200x630 social image)"

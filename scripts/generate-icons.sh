#!/bin/bash
# Generate app icons for Electron builds
# Run from the Trackli project root

set -e

SOURCE_ICON="public/icons/icon-512x512.png"
BUILD_DIR="build"
ICONSET_DIR="$BUILD_DIR/icon.iconset"

echo "Creating icon directories..."
mkdir -p "$BUILD_DIR"
mkdir -p "$ICONSET_DIR"
mkdir -p "$BUILD_DIR/icons"

# Check if source icon exists
if [ ! -f "$SOURCE_ICON" ]; then
    echo "Error: Source icon not found at $SOURCE_ICON"
    exit 1
fi

echo "Generating macOS iconset..."
# Generate all required sizes for macOS
sips -z 16 16     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$SOURCE_ICON" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_ICON" --out "$ICONSET_DIR/icon_512x512.png"
cp "$SOURCE_ICON" "$ICONSET_DIR/icon_512x512@2x.png"

echo "Creating macOS .icns file..."
iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"

echo "Generating Linux icons..."
# Copy various sizes for Linux
for size in 16 32 48 64 128 256 512; do
    sips -z $size $size "$SOURCE_ICON" --out "$BUILD_DIR/icons/${size}x${size}.png"
done

echo "Generating Windows .ico file..."
# For Windows, we need ImageMagick's convert command
# If not available, we'll skip this step
if command -v convert &> /dev/null; then
    convert "$SOURCE_ICON" -define icon:auto-resize=256,128,64,48,32,16 "$BUILD_DIR/icon.ico"
    echo "Windows icon created successfully!"
else
    echo "Warning: ImageMagick not found. Skipping Windows .ico generation."
    echo "Install ImageMagick with: brew install imagemagick"
    echo "Then re-run this script."
fi

# Cleanup
rm -rf "$ICONSET_DIR"

echo ""
echo "Icon generation complete!"
echo "Generated files:"
ls -la "$BUILD_DIR/"

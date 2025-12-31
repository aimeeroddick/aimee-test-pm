// Script to generate PWA icons from SVG
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function generateIcons() {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const svgPath = path.join(__dirname, '../public/favicon.svg');
  const iconsDir = path.join(__dirname, '../public/icons');
  
  // Ensure icons directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }
  
  const svgBuffer = fs.readFileSync(svgPath);
  
  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(iconsDir, `icon-${size}x${size}.png`));
    console.log(`Generated icon-${size}x${size}.png`);
  }
  
  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);

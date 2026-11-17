#!/usr/bin/env node
/**
 * Generate extension icons
 * Creates simple gradient circles with star emoji for now
 */

const fs = require('fs');
const path = require('path');

// Simple SVG to use as icon
const sizes = [16, 48, 128];

sizes.forEach(size => {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
  </defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="url(#grad${size})"/>
  <text x="${size/2}" y="${size/2 + size*0.25}" font-size="${size*0.6}" text-anchor="middle" fill="white">⭐</text>
</svg>`;

  const iconPath = path.join(__dirname, '../extension/icons', `icon${size}.svg`);
  fs.writeFileSync(iconPath, svg);
  console.log(`Created ${iconPath}`);
});

console.log('\n✓ Icon SVGs created!');
console.log('Note: Chrome extensions prefer PNG icons.');
console.log('Convert SVGs to PNGs using an online tool or ImageMagick:');
console.log('  convert icon.svg -resize 16x16 icon16.png');

#!/usr/bin/env node
/**
 * Generate placeholder sample images for demo
 * Run: node scripts/generate-sample-images.js
 * 
 * This creates simple colored placeholder images.
 * Replace these with real clothing model photos from Unsplash/Pexels.
 */

const fs = require('fs');
const path = require('path');

// Sample image specs
const samples = [
  { filename: 'model-1.jpg', color: '#6366f1', label: 'Casual Jacket', sublabel: 'PLACEHOLDER' },
  { filename: 'model-2.jpg', color: '#ec4899', label: 'Business Suit', sublabel: 'PLACEHOLDER' },
  { filename: 'model-3.jpg', color: '#f59e0b', label: 'Summer Dress', sublabel: 'PLACEHOLDER' },
  { filename: 'model-4.jpg', color: '#10b981', label: 'Winter Coat', sublabel: 'PLACEHOLDER' }
];

// Create a simple SVG as placeholder
function createPlaceholderSVG(spec) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad-${spec.filename}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:${spec.color};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#000;stop-opacity:0.8" />
    </linearGradient>
  </defs>
  
  <rect width="800" height="1000" fill="url(#grad-${spec.filename})"/>
  
  <text x="400" y="450" font-family="Arial, sans-serif" font-size="60" font-weight="bold" 
        fill="white" text-anchor="middle" opacity="0.9">
    ${spec.label}
  </text>
  
  <text x="400" y="520" font-family="Arial, sans-serif" font-size="36" 
        fill="white" text-anchor="middle" opacity="0.7">
    ${spec.sublabel}
  </text>
  
  <text x="400" y="600" font-family="Arial, sans-serif" font-size="24" 
        fill="white" text-anchor="middle" opacity="0.5">
    Replace with real photo
  </text>
  
  <rect x="250" y="350" width="300" height="400" rx="150" 
        fill="none" stroke="white" stroke-width="4" opacity="0.3"/>
</svg>`;
}

// Output directory
const outputDir = path.join(__dirname, '..', 'public', 'sample-images');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Generate placeholders
samples.forEach(spec => {
  const svg = createPlaceholderSVG(spec);
  const svgPath = path.join(outputDir, spec.filename.replace('.jpg', '.svg'));
  
  fs.writeFileSync(svgPath, svg);
  console.log(`✓ Generated ${spec.filename.replace('.jpg', '.svg')}`);
  
  // Also create a symlink or note for .jpg
  const notePath = path.join(outputDir, spec.filename + '.txt');
  fs.writeFileSync(
    notePath,
    `This is a placeholder. Download a real clothing model image and save as ${spec.filename}\n` +
    `See DOWNLOAD_SAMPLES.md for instructions.\n`
  );
});

console.log('\n✓ Sample image placeholders generated!');
console.log('  SVG files created in public/sample-images/');
console.log('  Replace these with real JPG images from Unsplash or Pexels.');
console.log('  See public/sample-images/DOWNLOAD_SAMPLES.md for details.\n');

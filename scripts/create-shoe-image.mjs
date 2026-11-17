#!/usr/bin/env node
/**
 * Create a simple placeholder shoe image (non-face product) for testing
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createSimplePNG(width, height, colors) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(25);
  ihdr.writeUInt32BE(13, 0);
  ihdr.write('IHDR', 4);
  ihdr.writeUInt32BE(width, 8);
  ihdr.writeUInt32BE(height, 12);
  ihdr.writeUInt8(8, 16);
  ihdr.writeUInt8(2, 17);
  ihdr.writeUInt8(0, 18);
  ihdr.writeUInt8(0, 19);
  ihdr.writeUInt8(0, 20);
  const ihdrCrc = crc32(ihdr.slice(4, 21));
  ihdr.writeUInt32BE(ihdrCrc, 21);
  
  // Create a shoe-like pattern
  const rowBytes = width * 3 + 1;
  const imageData = Buffer.alloc(rowBytes * height);
  
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    imageData[rowStart] = 0; // filter type
    
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      // Create a simple gradient pattern (shoe-like)
      const isTop = y < height / 3;
      const isBottom = y > height * 0.6;
      
      if (isTop) {
        // Gray top
        imageData[pixelStart] = 100;
        imageData[pixelStart + 1] = 100;
        imageData[pixelStart + 2] = 100;
      } else if (isBottom) {
        // Black sole
        imageData[pixelStart] = 30;
        imageData[pixelStart + 1] = 30;
        imageData[pixelStart + 2] = 30;
      } else {
        // Blue shoe body
        imageData[pixelStart] = 70;
        imageData[pixelStart + 1] = 130;
        imageData[pixelStart + 2] = 180;
      }
    }
  }
  
  const compressed = zlib.deflateSync(imageData);
  
  const idat = Buffer.alloc(compressed.length + 12);
  idat.writeUInt32BE(compressed.length, 0);
  idat.write('IDAT', 4);
  compressed.copy(idat, 8);
  const idatCrc = crc32(idat.slice(4, idat.length - 4));
  idat.writeUInt32BE(idatCrc, idat.length - 4);
  
  const iend = Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crc ^ buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const shoe = createSimplePNG(400, 300, null);
writeFileSync(join(__dirname, '../public/sample-images/shoe.png'), shoe);
console.log('✅ Shoe image created');

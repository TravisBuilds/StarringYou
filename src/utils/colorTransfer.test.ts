import { describe, it, expect } from 'vitest';

// RGB to LAB conversion
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // RGB to XYZ
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  
  // XYZ to LAB (D65 illuminant)
  x = x / 0.95047; y = y / 1.00000; z = z / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToRgb(l: number, a: number, b: number): [number, number, number] {
  // LAB to XYZ
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  
  x = Math.pow(x, 3) > 0.008856 ? Math.pow(x, 3) : (x - 16/116) / 7.787;
  y = Math.pow(y, 3) > 0.008856 ? Math.pow(y, 3) : (y - 16/116) / 7.787;
  z = Math.pow(z, 3) > 0.008856 ? Math.pow(z, 3) : (z - 16/116) / 7.787;
  
  x *= 0.95047; y *= 1.00000; z *= 1.08883;
  
  // XYZ to RGB
  let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
  let g_ = x * -0.9689 + y *  1.8758 + z *  0.0415;
  let b_ = x *  0.0557 + y * -0.2040 + z *  1.0570;
  
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
  g_ = g_ > 0.0031308 ? 1.055 * Math.pow(g_, 1/2.4) - 0.055 : 12.92 * g_;
  b_ = b_ > 0.0031308 ? 1.055 * Math.pow(b_, 1/2.4) - 0.055 : 12.92 * b_;
  
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g_ * 255))),
    Math.max(0, Math.min(255, Math.round(b_ * 255)))
  ];
}

describe('Color conversion', () => {
  it('RGB to LAB to RGB round-trip within ±2', () => {
    const testCases = [
      [0, 0, 0],
      [255, 255, 255],
      [128, 128, 128],
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [180, 140, 120], // skin tone
      [210, 180, 160], // lighter skin
      [120, 80, 60],   // darker skin
    ];
    
    testCases.forEach(([r, g, b]) => {
      const lab = rgbToLab(r, g, b);
      const [r2, g2, b2] = labToRgb(lab[0], lab[1], lab[2]);
      
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(2);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(2);
    });
  });
  
  it('Random pixels round-trip within ±2', () => {
    for (let i = 0; i < 100; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      
      const lab = rgbToLab(r, g, b);
      const [r2, g2, b2] = labToRgb(lab[0], lab[1], lab[2]);
      
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(2);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(2);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(2);
    }
  });
  
  it('Identity transfer preserves image', () => {
    const pixels = [
      [180, 140, 120],
      [190, 150, 130],
      [170, 130, 110],
    ];
    
    // Compute mean and std
    const mean = { L: 0, A: 0, B: 0 };
    const labs = pixels.map(([r, g, b]) => rgbToLab(r, g, b));
    labs.forEach(lab => {
      mean.L += lab[0] / labs.length;
      mean.A += lab[1] / labs.length;
      mean.B += lab[2] / labs.length;
    });
    
    const std = { L: 0, A: 0, B: 0 };
    labs.forEach(lab => {
      std.L += Math.pow(lab[0] - mean.L, 2) / labs.length;
      std.A += Math.pow(lab[1] - mean.A, 2) / labs.length;
      std.B += Math.pow(lab[2] - mean.B, 2) / labs.length;
    });
    std.L = Math.sqrt(std.L);
    std.A = Math.sqrt(std.A);
    std.B = Math.sqrt(std.B);
    
    // Identity transfer (same mean/std)
    pixels.forEach(([r, g, b]) => {
      const lab = rgbToLab(r, g, b);
      lab[0] = ((lab[0] - mean.L) / (std.L + 1e-6)) * std.L + mean.L;
      lab[1] = ((lab[1] - mean.A) / (std.A + 1e-6)) * std.A + mean.A;
      lab[2] = ((lab[2] - mean.B) / (std.B + 1e-6)) * std.B + mean.B;
      const [r2, g2, b2] = labToRgb(lab[0], lab[1], lab[2]);
      
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(3);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(3);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(3);
    });
  });
});

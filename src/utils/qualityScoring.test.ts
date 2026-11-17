/**
 * Unit tests for frame quality scoring
 */

import { describe, it, expect } from 'vitest';
import {
  calculateSharpness,
  calculateBrightness,
  calculateFaceSize,
  calculateCentering,
  evaluateFrameQuality,
  meetsQualityThreshold
} from './qualityScoring';
import type { FaceLandmarks } from '../types';

describe('Quality Scoring', () => {
  // Helper to create test ImageData
  function createTestImageData(width: number, height: number, fillValue = 128): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = fillValue;     // R
      data[i + 1] = fillValue; // G
      data[i + 2] = fillValue; // B
      data[i + 3] = 255;       // A
    }
    return new ImageData(data, width, height);
  }

  // Helper to create test landmarks
  function createTestLandmarks(centerX = 0.5, centerY = 0.5, size = 0.2): FaceLandmarks {
    const landmarks = [];
    const halfSize = size / 2;
    
    // Create a simple face-like grid of landmarks
    // First landmark must be at index 1 (nose tip) for centering calculation
    landmarks.push({ x: centerX, y: centerY, z: 0 }); // Index 0
    landmarks.push({ x: centerX, y: centerY, z: 0 }); // Index 1 - nose tip (used for centering)
    
    for (let y = -halfSize; y <= halfSize; y += size / 10) {
      for (let x = -halfSize; x <= halfSize; x += size / 10) {
        landmarks.push({
          x: centerX + x,
          y: centerY + y,
          z: 0
        });
      }
    }
    
    return { landmarks };
  }

  describe('calculateBrightness', () => {
    it('should calculate correct brightness for uniform image', () => {
      const imageData = createTestImageData(100, 100, 128);
      const brightness = calculateBrightness(imageData);
      expect(brightness).toBeCloseTo(128, 1);
    });

    it('should return higher value for bright image', () => {
      const dark = createTestImageData(100, 100, 50);
      const bright = createTestImageData(100, 100, 200);
      expect(calculateBrightness(bright)).toBeGreaterThan(calculateBrightness(dark));
    });
  });

  describe('calculateSharpness', () => {
    it('should return higher value for edges', () => {
      const uniform = createTestImageData(50, 50, 128);
      
      // Create image with edges
      const edged = createTestImageData(50, 50, 0);
      const edgedData = edged.data;
      for (let i = 0; i < 25; i++) {
        for (let j = 0; j < 50; j++) {
          const idx = (i * 50 + j) * 4;
          edgedData[idx] = 255;
          edgedData[idx + 1] = 255;
          edgedData[idx + 2] = 255;
        }
      }
      
      expect(calculateSharpness(edged)).toBeGreaterThan(calculateSharpness(uniform));
    });
  });

  describe('calculateFaceSize', () => {
    it('should calculate correct face size', () => {
      const landmarks = createTestLandmarks(0.5, 0.5, 0.2);
      const size = calculateFaceSize(landmarks, 640, 480);
      
      // Should be around 0.04 (0.2 * 0.2)
      expect(size).toBeGreaterThan(0.03);
      expect(size).toBeLessThan(0.06);
    });

    it('should return larger value for larger face', () => {
      const small = createTestLandmarks(0.5, 0.5, 0.1);
      const large = createTestLandmarks(0.5, 0.5, 0.3);
      
      const smallSize = calculateFaceSize(small, 640, 480);
      const largeSize = calculateFaceSize(large, 640, 480);
      
      expect(largeSize).toBeGreaterThan(smallSize);
    });
  });

  describe('calculateCentering', () => {
    it('should return 0 for perfectly centered face', () => {
      const centered = createTestLandmarks(0.5, 0.5, 0.2);
      const centering = calculateCentering(centered);
      expect(centering).toBeCloseTo(0, 1);
    });

    it('should return higher value for off-center face', () => {
      const centered = createTestLandmarks(0.5, 0.5, 0.2);
      const offCenter = createTestLandmarks(0.7, 0.3, 0.2);
      
      expect(calculateCentering(offCenter)).toBeGreaterThan(calculateCentering(centered));
    });
  });

  describe('evaluateFrameQuality', () => {
    it('should evaluate frame quality correctly', () => {
      const imageData = createTestImageData(640, 480, 128);
      const landmarks = createTestLandmarks(0.5, 0.5, 0.2);
      
      const quality = evaluateFrameQuality(imageData, landmarks, true);
      
      expect(quality.brightness).toBeCloseTo(128, 1);
      expect(quality.eyesOpen).toBe(true);
      expect(quality.overallScore).toBeGreaterThan(0);
      expect(quality.overallScore).toBeLessThanOrEqual(100);
    });

    it('should penalize closed eyes', () => {
      const imageData = createTestImageData(640, 480, 128);
      const landmarks = createTestLandmarks(0.5, 0.5, 0.2);
      
      const eyesOpen = evaluateFrameQuality(imageData, landmarks, true);
      const eyesClosed = evaluateFrameQuality(imageData, landmarks, false);
      
      expect(eyesOpen.overallScore).toBeGreaterThan(eyesClosed.overallScore);
    });
  });

  describe('meetsQualityThreshold', () => {
    it('should accept high quality frame', () => {
      const imageData = createTestImageData(640, 480, 128);
      const landmarks = createTestLandmarks(0.5, 0.5, 0.2);
      const quality = evaluateFrameQuality(imageData, landmarks, true);
      
      // Adjust quality to meet threshold
      quality.overallScore = 70;
      quality.sharpness = 50;
      quality.faceSize = 0.15;
      
      expect(meetsQualityThreshold(quality)).toBe(true);
    });

    it('should reject low quality frame', () => {
      const quality = {
        sharpness: 10,
        brightness: 50,
        faceSize: 0.05,
        centering: 0.6,
        eyesOpen: false,
        overallScore: 30
      };
      
      expect(meetsQualityThreshold(quality)).toBe(false);
    });
  });
});

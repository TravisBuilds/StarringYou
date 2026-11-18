/**
 * Tests for pose-aware frame selection
 */

import { describe, it, expect } from 'vitest';
import type { CapturedFrame } from './types';

describe('Frame Selection Logic', () => {
  // Helper to create a mock frame
  const createMockFrame = (yaw: number, pitch: number, quality: number = 80): CapturedFrame => ({
    imageData: new ImageData(1, 1),
    dataUrl: `data:image/jpeg;base64,frame_${yaw}_${pitch}`,
    landmarks: { landmarks: [] },
    pose: { yaw, pitch, roll: 0 },
    quality: {
      sharpness: 100,
      brightness: 128,
      faceSize: 0.5,
      centering: 0.5,
      eyesOpen: true,
      overallScore: quality
    },
    stepId: 'test',
    timestamp: Date.now(),
    yaw,
    pitch
  });

  const selectBestFrame = (
    frames: CapturedFrame[],
    targetYaw: number,
    targetPitch: number
  ): CapturedFrame | null => {
    let bestFrame: CapturedFrame | null = null;
    let bestDistance = Infinity;

    for (const frame of frames) {
      const yawDist = Math.abs(frame.yaw - targetYaw);
      const pitchDist = Math.abs(frame.pitch - targetPitch);
      const distance = yawDist * 2 + pitchDist;
      
      if (distance < bestDistance && frame.quality.overallScore > 50) {
        bestDistance = distance;
        bestFrame = frame;
      }
    }

    return bestFrame;
  };

  it('should select frontal frame for frontal target', () => {
    const frames = [
      createMockFrame(0, 0),    // Frontal
      createMockFrame(20, 0),   // Left turn
      createMockFrame(-20, 0),  // Right turn
    ];

    const best = selectBestFrame(frames, 0, 0);
    expect(best?.yaw).toBe(0);
    expect(best?.pitch).toBe(0);
  });

  it('should select left-turned frame for left-turned target', () => {
    const frames = [
      createMockFrame(0, 0),
      createMockFrame(25, 0),   // Left turn
      createMockFrame(-25, 0),
    ];

    const best = selectBestFrame(frames, 20, 0);
    expect(best?.yaw).toBe(25);
  });

  it('should select right-turned frame for right-turned target', () => {
    const frames = [
      createMockFrame(0, 0),
      createMockFrame(25, 0),
      createMockFrame(-25, 0),  // Right turn
    ];

    const best = selectBestFrame(frames, -20, 0);
    expect(best?.yaw).toBe(-25);
  });

  it('should weight yaw more heavily than pitch', () => {
    const frames = [
      createMockFrame(10, 0),   // Close yaw, perfect pitch
      createMockFrame(0, 5),    // Perfect yaw, close pitch
    ];

    const best = selectBestFrame(frames, 0, 0);
    // Pitch difference (5) should matter less than yaw difference (10 * 2 = 20)
    expect(best?.yaw).toBe(0);
    expect(best?.pitch).toBe(5);
  });

  it('should filter out low quality frames', () => {
    const frames = [
      createMockFrame(0, 0, 40),   // Perfect pose but low quality
      createMockFrame(15, 0, 85),  // Good pose and quality
    ];

    const best = selectBestFrame(frames, 0, 0);
    // Should skip the low quality frame even though pose is better
    expect(best?.quality.overallScore).toBeGreaterThan(50);
    expect(best?.yaw).toBe(15);
  });

  it('should handle negative yaw correctly (mirroring)', () => {
    const frames = [
      createMockFrame(-30, 0),  // Right turn
      createMockFrame(-15, 0),
      createMockFrame(0, 0),
    ];

    const best = selectBestFrame(frames, -25, 0);
    expect(best?.yaw).toBe(-30);
  });
});

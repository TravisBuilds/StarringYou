/**
 * Frame quality scoring for enrollment
 * Evaluates sharpness, brightness, face size, centering, and eyes-open
 */

import type { FrameQuality, FaceLandmarks } from '../types';

/**
 * Calculate Laplacian variance as a measure of sharpness
 * Higher values indicate sharper images
 */
export function calculateSharpness(imageData: ImageData): number {
  const { width, height, data } = imageData;
  
  // Convert to grayscale and compute Laplacian
  const gray = new Float32Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  
  // Laplacian kernel: [0 1 0; 1 -4 1; 0 1 0]
  let variance = 0;
  let count = 0;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const laplacian = 
        gray[idx - width] + 
        gray[idx - 1] + 
        gray[idx + 1] + 
        gray[idx + width] - 
        4 * gray[idx];
      
      variance += laplacian * laplacian;
      count++;
    }
  }
  
  return count > 0 ? variance / count : 0;
}

/**
 * Calculate average brightness (luminance)
 */
export function calculateBrightness(imageData: ImageData): number {
  const { data } = imageData;
  let sum = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    // Luminance formula
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  
  return sum / (data.length / 4);
}

/**
 * Calculate face size as fraction of frame
 */
export function calculateFaceSize(
  landmarks: FaceLandmarks,
  _frameWidth: number,
  _frameHeight: number
): number {
  const pts = landmarks.landmarks;
  
  // Find bounding box
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const pt of pts) {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  
  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  
  return faceWidth * faceHeight; // Already normalized 0-1
}

/**
 * Calculate how centered the face is (0 = perfect center, 1 = edge)
 */
export function calculateCentering(landmarks: FaceLandmarks): number {
  const pts = landmarks.landmarks;
  
  // Use nose tip as face center
  const noseTip = pts[1];
  
  // Distance from frame center (0.5, 0.5)
  const dx = noseTip.x - 0.5;
  const dy = noseTip.y - 0.5;
  
  return Math.sqrt(dx * dx + dy * dy) * 2; // Scale to 0-1
}

/**
 * Evaluate overall frame quality
 */
export function evaluateFrameQuality(
  imageData: ImageData,
  landmarks: FaceLandmarks,
  eyesOpen: boolean
): FrameQuality {
  const sharpness = calculateSharpness(imageData);
  const brightness = calculateBrightness(imageData);
  const faceSize = calculateFaceSize(landmarks, imageData.width, imageData.height);
  const centering = calculateCentering(landmarks);
  
  // Normalize metrics to 0-100 scale with ideal ranges
  const sharpnessScore = Math.min(100, (sharpness / 100) * 100); // >50 is good
  const brightnessScore = Math.max(0, 100 - Math.abs(brightness - 128) * 0.8); // ~128 is ideal
  const faceSizeScore = Math.min(100, faceSize * 500); // 0.15-0.25 is ideal
  const centeringScore = Math.max(0, 100 - centering * 100); // 0 is perfect
  const eyesOpenScore = eyesOpen ? 100 : 0;
  
  // Weighted composite score
  const overallScore = (
    sharpnessScore * 0.35 +
    brightnessScore * 0.15 +
    faceSizeScore * 0.20 +
    centeringScore * 0.15 +
    eyesOpenScore * 0.15
  );
  
  return {
    sharpness,
    brightness,
    faceSize,
    centering,
    eyesOpen,
    overallScore: Math.round(overallScore)
  };
}

/**
 * Check if frame quality meets minimum thresholds
 */
export function meetsQualityThreshold(quality: FrameQuality): boolean {
  return (
    quality.overallScore >= 60 &&
    quality.sharpness >= 30 &&
    quality.brightness >= 50 &&
    quality.brightness <= 200 &&
    quality.faceSize >= 0.10 &&
    quality.centering <= 0.4
  );
}

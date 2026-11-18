/**
 * Face detection and landmark utilities using MediaPipe
 */

import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { FaceLandmarks, HeadPose } from '../types';

declare const chrome: any;

let faceLandmarker: FaceLandmarker | null = null;
let isInitializing = false;

/**
 * Initialize MediaPipe Face Landmarker
 * Bundles models locally for extension compatibility
 */
export async function initializeFaceDetection(): Promise<void> {
  if (faceLandmarker) return;
  if (isInitializing) {
    // Wait for existing initialization
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isInitializing = true;
  try {
    // Detect if we're in an extension context
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL;
    
    const wasmPath = isExtension 
      ? chrome.runtime.getURL('mediapipe/wasm')
      : `${import.meta.env.BASE_URL}mediapipe/wasm`;
    
    const modelPath = isExtension
      ? chrome.runtime.getURL('mediapipe/models/face_landmarker.task')
      : `${import.meta.env.BASE_URL}mediapipe/models/face_landmarker.task`;
    
    console.log('Loading MediaPipe from:', { wasmPath, modelPath });
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: modelPath,
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
    console.log('MediaPipe initialized successfully');
  } catch (error) {
    console.error('MediaPipe initialization failed:', error);
    throw error;
  } finally {
    isInitializing = false;
  }
}

/**
 * Detect faces in a video frame
 */
export function detectFaces(
  video: HTMLVideoElement,
  timestamp: number
): FaceLandmarkerResult | null {
  if (!faceLandmarker) {
    throw new Error('Face landmarker not initialized');
  }
  
  return faceLandmarker.detectForVideo(video, timestamp);
}

/**
 * Extract head pose (yaw, pitch, roll) from face landmarks
 * Using simplified pose estimation from landmark positions
 */
export function estimateHeadPose(landmarks: FaceLandmarks): HeadPose {
  const pts = landmarks.landmarks;
  
  // Key landmarks for pose estimation
  const noseTip = pts[1]; // Nose tip
  const leftEye = pts[33]; // Left eye outer corner
  const rightEye = pts[263]; // Right eye outer corner
  const chin = pts[152]; // Chin
  
  // Calculate yaw (left-right rotation) from eye positions
  const eyeDx = rightEye.x - leftEye.x;
  const eyeDy = rightEye.y - leftEye.y;
  const yaw = Math.atan2(eyeDy, eyeDx) * (180 / Math.PI);
  
  // Calculate pitch (up-down rotation) from nose-to-chin distance
  const faceHeight = Math.abs(noseTip.y - chin.y);
  const expectedHeight = 0.15; // Normalized face height when looking straight
  const pitch = (expectedHeight - faceHeight) * 200 - 10; // Rough approximation
  
  // Calculate roll (tilt) from eye horizontal alignment
  const roll = -yaw; // Simplified - in reality would use more landmarks
  
  return {
    yaw: Math.max(-90, Math.min(90, yaw * 2)), // Scale and clamp
    pitch: Math.max(-45, Math.min(45, pitch)),
    roll: Math.max(-30, Math.min(30, roll))
  };
}

/**
 * Check if eyes are open based on blendshapes
 */
export function areEyesOpen(result: FaceLandmarkerResult): boolean {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return true; // Assume open if no blendshape data
  }
  
  const blendshapes = result.faceBlendshapes[0].categories;
  const eyeBlinkLeft = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
  const eyeBlinkRight = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
  
  // Eyes are considered open if blink score is low (< 0.3)
  return eyeBlinkLeft < 0.3 && eyeBlinkRight < 0.3;
}

/**
 * Check if user is blinking
 */
export function isBlinking(result: FaceLandmarkerResult): boolean {
  if (!result.faceBlendshapes || result.faceBlendshapes.length === 0) {
    return false;
  }
  
  const blendshapes = result.faceBlendshapes[0].categories;
  const eyeBlinkLeft = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
  const eyeBlinkRight = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
  
  // Blinking if both eyes have high blink score (> 0.7)
  return eyeBlinkLeft > 0.7 && eyeBlinkRight > 0.7;
}

/**
 * Check if detected pose matches target pose within tolerances
 */
export function isPoseMatched(
  detected: HeadPose,
  target: HeadPose,
  tolerances: { yaw: number; pitch: number; roll: number }
): boolean {
  return (
    Math.abs(detected.yaw - target.yaw) <= tolerances.yaw &&
    Math.abs(detected.pitch - target.pitch) <= tolerances.pitch &&
    Math.abs(detected.roll - target.roll) <= tolerances.roll
  );
}

/**
 * Clean up resources
 */
export function disposeFaceDetection(): void {
  if (faceLandmarker) {
    faceLandmarker.close();
    faceLandmarker = null;
  }
}

/**
 * Offscreen document for face detection using MediaPipe
 * Runs in a separate context to use DOM/Canvas APIs with MV3
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';

console.log('[Offscreen] Script loading...');

let faceLandmarker = null;
let isInitializing = false;

// Initialize MediaPipe Face Landmarker
async function initializeFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return faceLandmarker;
  }
  
  isInitializing = true;
  console.log('[Offscreen] Initializing MediaPipe Face Landmarker...');
  
  try {
    const vision = await FilesetResolver.forVisionTasks(
      chrome.runtime.getURL('mediapipe/wasm')
    );
    
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('mediapipe/models/face_landmarker.task'),
        delegate: 'GPU'
      },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    console.log('[Offscreen] MediaPipe initialized successfully');
    isInitializing = false;
    return faceLandmarker;
  } catch (error) {
    console.error('[Offscreen] Failed to initialize MediaPipe:', error);
    isInitializing = false;
    throw error;
  }
}

// Detect face in an image from URL
async function detectFaceFromUrl(imageUrl) {
  try {
    await initializeFaceLandmarker();
    
    // Fetch and load image
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);
    
    // Downscale to max 512px on long side for faster detection
    const maxDim = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, 512 / maxDim);
    const scaledWidth = Math.round(bitmap.width * scale);
    const scaledHeight = Math.round(bitmap.height * scale);
    
    const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, scaledWidth, scaledHeight);
    
    // Run detection on downscaled image
    const results = await faceLandmarker.detect(canvas);
    
    console.log(`[Offscreen] Face detection result: ${results.faceLandmarks?.length || 0} faces detected`);
    
    if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
      return { success: false, error: 'No face detected' };
    }
    
    // Get first face
    const landmarks = results.faceLandmarks[0];
    console.log('[Offscreen] Processing face landmarks...');
    
    // Calculate face bounding box
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    landmarks.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    
    // Get key landmarks (eyes, nose, mouth)
    const leftEye = landmarks[33];   // Left eye center
    const rightEye = landmarks[263];  // Right eye center
    const nose = landmarks[1];        // Nose tip
    const mouth = landmarks[13];      // Mouth center
    
    // Estimate head pose (simplified)
    const leftTemple = landmarks[234];
    const rightTemple = landmarks[454];
    const chinBottom = landmarks[152];
    const foreheadCenter = landmarks[10];
    
    // Yaw: horizontal face angle
    const faceWidth = Math.abs(rightTemple.x - leftTemple.x);
    const leftDist = Math.abs(nose.x - leftTemple.x);
    const rightDist = Math.abs(rightTemple.x - nose.x);
    const yaw = ((leftDist - rightDist) / faceWidth) * 45;
    
    // Pitch: vertical face angle
    const faceHeight = Math.abs(chinBottom.y - foreheadCenter.y);
    const noseToChin = Math.abs(chinBottom.y - nose.y);
    const pitch = ((noseToChin / faceHeight) - 0.5) * 60 - 10;
    
    // Roll: face rotation
    const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * (180 / Math.PI);
    
    return {
      success: true,
      landmarks: landmarks.map(p => ({ x: p.x, y: p.y, z: p.z })),
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      keyPoints: {
        leftEye: { x: leftEye.x, y: leftEye.y },
        rightEye: { x: rightEye.x, y: rightEye.y },
        nose: { x: nose.x, y: nose.y },
        mouth: { x: mouth.x, y: mouth.y }
      },
      pose: {
        yaw: yaw,
        pitch: pitch,
        roll: roll
      }
    };
  } catch (error) {
    console.error('[Offscreen] Face detection error:', error);
    return { success: false, error: error.message };
  }
}

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'detectFace') {
    detectFaceFromUrl(request.imageUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'performSwap') {
    performSwapInOffscreen(request.sourceUrl, request.targetUrl)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

console.log('[Offscreen] Face detection worker ready');

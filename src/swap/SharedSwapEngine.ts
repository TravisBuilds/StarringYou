/**
 * Shared Face Swap Engine  
 * Proven implementation from extension v2 (commit 0607d80)
 * Used by both web app and extension
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { CapturedFrame } from '../types';

declare const chrome: any;

// MediaPipe landmark indices
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

const BROW_INDICES = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];

const INNER_FACE_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  123, 116, 118, 50, 101, 100, 47, 126, 217, 205, 187, 207, 
  206, 203, 142, 98, 97, 2, 326, 327, 294, 278, 439, 438, 
  371, 355, 266, 425, 423, 426, 411, 416, 434, 432, 430
];

interface SourceCacheData {
  cropCanvas: HTMLCanvasElement;
  landmarks: Array<{ x: number; y: number }>;
  eyeDist: number;
  angle: number;
  faceCenter: { x: number; y: number };
  cropX: number;
  cropY: number;
}

// Separable box blur for mask feathering
function boxBlurImageData(imageData: ImageData, radius: number): void {
  const { width, height, data } = imageData;
  
  // Horizontal pass
  const temp = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let kx = -radius; kx <= radius; kx++) {
        const sx = x + kx;
        if (sx >= 0 && sx < width) {
          sum += data[(y * width + sx) * 4 + 3];
          count++;
        }
      }
      temp[(y * width + x) * 4 + 3] = sum / count;
    }
  }
  
  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let ky = -radius; ky <= radius; ky++) {
        const sy = y + ky;
        if (sy >= 0 && sy < height) {
          sum += temp[(sy * width + x) * 4 + 3];
          count++;
        }
      }
      data[(y * width + x) * 4 + 3] = sum / count;
    }
  }
}

export class SharedSwapEngine {
  private faceLandmarker: FaceLandmarker | null = null;
  private sourceCache: SourceCacheData | null = null;
  
  /**
   * Detect target face pose (yaw/pitch) for frame selection
   */
  async detectTargetPose(imageUrl: string): Promise<{ yaw: number; pitch: number } | null> {
    await this.initialize();
    
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = imageUrl;
    });
    
    await img.decode();
    
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    
    const result = this.faceLandmarker!.detect(canvas);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }
    
    const landmarks = result.faceLandmarks[0].map(p => ({
      x: p.x * canvas.width,
      y: p.y * canvas.height
    }));
    
    // Calculate pose from landmarks
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    const eyeCenterX = (leftEye.x + rightEye.x) / 2;
    const noseOffsetX = nose.x - eyeCenterX;
    const eyeWidth = Math.abs(rightEye.x - leftEye.x);
    const yaw = -(noseOffsetX / eyeWidth) * 90; // Negated for mirrored coordinates
    
    const eyeCenterY = (leftEye.y + rightEye.y) / 2;
    const noseOffsetY = nose.y - eyeCenterY;
    const faceHeight = canvas.height * 0.3; // Approximate face height
    const pitch = (noseOffsetY / faceHeight) * 60;
    
    return { yaw, pitch };
  }
  
  async initialize(): Promise<void> {
    if (this.faceLandmarker) return;
    
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.getURL;
    const wasmPath = isExtension 
      ? chrome.runtime.getURL('mediapipe/wasm')
      : `${import.meta.env.BASE_URL}mediapipe/wasm`;
    
    const modelPath = isExtension
      ? chrome.runtime.getURL('mediapipe/models/face_landmarker.task')
      : `${import.meta.env.BASE_URL}mediapipe/models/face_landmarker.task`;
    
    const vision = await FilesetResolver.forVisionTasks(wasmPath);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
      runningMode: 'IMAGE',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
  }
  
  /**
   * Process and cache source face data
   */
  async processSourceFace(sourceFaceDataUrl: string): Promise<SourceCacheData> {
    await this.initialize();
    
    // Load source image and wait for it
    const sourceImg = new Image();
    await new Promise<void>((resolve, reject) => {
      sourceImg.onload = () => resolve();
      sourceImg.onerror = reject;
      sourceImg.src = sourceFaceDataUrl;
    });
    
    await sourceImg.decode();
    
    console.log(`Source image loaded: ${sourceImg.naturalWidth}x${sourceImg.naturalHeight}`);
    
    // Detect face
    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = sourceImg.naturalWidth;
    sourceCanvas.height = sourceImg.naturalHeight;
    const sourceCtx = sourceCanvas.getContext('2d')!;
    sourceCtx.drawImage(sourceImg, 0, 0);
    
    const result = this.faceLandmarker!.detect(sourceCanvas);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      throw new Error('No face detected in source image');
    }
    
    const srcLandmarks = result.faceLandmarks[0].map(p => ({
      x: p.x * sourceImg.naturalWidth,
      y: p.y * sourceImg.naturalHeight
    }));
    
    // Compute source face properties
    const srcFaceOval = FACE_OVAL_INDICES.map(i => srcLandmarks[i]);
    const srcLeftEye = srcLandmarks[33];
    const srcRightEye = srcLandmarks[263];
    const srcMouthLeft = srcLandmarks[61];
    const srcMouthRight = srcLandmarks[291];
    const srcChin = srcLandmarks[152];
    
    const srcEyeCenter = { 
      x: (srcLeftEye.x + srcRightEye.x) / 2,
      y: (srcLeftEye.y + srcRightEye.y) / 2
    };
    const srcMouthCenter = {
      x: (srcMouthLeft.x + srcMouthRight.x) / 2,
      y: (srcMouthLeft.y + srcMouthRight.y) / 2
    };
    const srcFaceCenter = {
      x: (srcEyeCenter.x + srcMouthCenter.x + srcChin.x) / 3,
      y: (srcEyeCenter.y + srcMouthCenter.y + srcChin.y) / 3
    };
    const srcEyeDist = Math.hypot(srcRightEye.x - srcLeftEye.x, srcRightEye.y - srcLeftEye.y);
    const srcAngle = Math.atan2(srcRightEye.y - srcLeftEye.y, srcRightEye.x - srcLeftEye.x);
    
    // Crop with 40% padding
    const srcMinX = Math.min(...srcFaceOval.map(p => p.x));
    const srcMaxX = Math.max(...srcFaceOval.map(p => p.x));
    const srcMinY = Math.min(...srcFaceOval.map(p => p.y));
    const srcMaxY = Math.max(...srcFaceOval.map(p => p.y));
    const srcWidth = srcMaxX - srcMinX;
    const srcHeight = srcMaxY - srcMinY;
    
    const padding = 0.4;
    const cropX = Math.max(0, srcMinX - srcWidth * padding);
    const cropY = Math.max(0, srcMinY - srcHeight * padding);
    const cropW = Math.min(sourceImg.naturalWidth - cropX, srcWidth * (1 + 2 * padding));
    const cropH = Math.min(sourceImg.naturalHeight - cropY, srcHeight * (1 + 2 * padding));
    
    // Create cropped canvas
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropW;
    cropCanvas.height = cropH;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(sourceImg, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    
    // Verify crop has content
    const cropData = cropCtx.getImageData(0, 0, cropW, cropH);
    const meanBrightness = Array.from(cropData.data)
      .filter((_, i) => i % 4 !== 3)
      .reduce((sum, v) => sum + v, 0) / (cropData.data.length * 0.75);
    
    if (meanBrightness < 10) {
      throw new Error(`Source crop is too dark (mean brightness ${meanBrightness.toFixed(1)}). Check image loading.`);
    }
    
    console.log(`Source crop: ${cropW}x${cropH}, mean brightness: ${meanBrightness.toFixed(1)}`);
    
    this.sourceCache = {
      cropCanvas,
      landmarks: srcLandmarks,
      eyeDist: srcEyeDist,
      angle: srcAngle,
      faceCenter: srcFaceCenter,
      cropX,
      cropY
    };
    
    return this.sourceCache;
  }
  
  /**
   * Swap face from enrolled frame onto target image
   */
  async swapFaces(enrolledFrame: CapturedFrame, targetImageDataUrl: string): Promise<string> {
    const t0 = performance.now();
    await this.initialize();
    
    // Process source (uses cache if available)
    if (!this.sourceCache) {
      await this.processSourceFace(enrolledFrame.dataUrl);
    }
    const sourceData = this.sourceCache!;
    
    // Load and detect target
    const targetImg = new Image();
    await new Promise<void>((resolve, reject) => {
      targetImg.onload = () => resolve();
      targetImg.onerror = reject;
      targetImg.src = targetImageDataUrl;
    });
    
    await targetImg.decode();
    
    const canvas = document.createElement('canvas');
    canvas.width = targetImg.naturalWidth;
    canvas.height = targetImg.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(targetImg, 0, 0);
    
    const tgtResult = this.faceLandmarker!.detect(canvas);
    if (!tgtResult.faceLandmarks || tgtResult.faceLandmarks.length === 0) {
      throw new Error('No face detected in target image');
    }
    
    const tgtLandmarks = tgtResult.faceLandmarks[0].map(p => ({
      x: p.x * canvas.width,
      y: p.y * canvas.height
    }));
    
    // Compute target face properties
    const tgtLeftEye = tgtLandmarks[33];
    const tgtRightEye = tgtLandmarks[263];
    const tgtMouthLeft = tgtLandmarks[61];
    const tgtMouthRight = tgtLandmarks[291];
    const tgtChin = tgtLandmarks[152];
    
    const tgtEyeCenter = { 
      x: (tgtLeftEye.x + tgtRightEye.x) / 2,
      y: (tgtLeftEye.y + tgtRightEye.y) / 2
    };
    const tgtMouthCenter = {
      x: (tgtMouthLeft.x + tgtMouthRight.x) / 2,
      y: (tgtMouthLeft.y + tgtMouthRight.y) / 2
    };
    const tgtFaceCenter = {
      x: (tgtEyeCenter.x + tgtMouthCenter.x + tgtChin.x) / 3,
      y: (tgtEyeCenter.y + tgtMouthCenter.y + tgtChin.y) / 3
    };
    const tgtEyeDist = Math.hypot(tgtRightEye.x - tgtLeftEye.x, tgtRightEye.y - tgtLeftEye.y);
    const tgtAngle = Math.atan2(tgtRightEye.y - tgtLeftEye.y, tgtRightEye.x - tgtLeftEye.x);
    
    // Compute similarity transform
    const scale = tgtEyeDist / sourceData.eyeDist;
    const rotation = tgtAngle - sourceData.angle;
    
    // Create FACE_OVAL mask with brow clamp and extended chin
    let tgtFaceOval = FACE_OVAL_INDICES.map(i => tgtLandmarks[i]);
    const tgtBrows = BROW_INDICES.map(i => tgtLandmarks[i]);
    const browMaxY = Math.max(...tgtBrows.map(p => p.y));
    tgtFaceOval = tgtFaceOval.map(p => ({ x: p.x, y: Math.max(p.y, browMaxY) }));
    
    const centroid = tgtFaceOval.reduce((acc, p) => ({
      x: acc.x + p.x / tgtFaceOval.length,
      y: acc.y + p.y / tgtFaceOval.length
    }), { x: 0, y: 0 });
    
    // 4% shrink, but extend chin/jaw points downward for better coverage
    tgtFaceOval = tgtFaceOval.map((p, idx) => {
      // Bottom half of oval (indices 16-36) - chin and jaw region
      const isLowerFace = idx >= 16 && idx <= 36;
      const shrinkFactor = isLowerFace ? 0.01 : 0.04; // Less shrink on lower face
      
      let adjustedP = {
        x: p.x + (centroid.x - p.x) * shrinkFactor,
        y: p.y + (centroid.y - p.y) * shrinkFactor
      };
      
      // Extend chin points downward slightly
      if (idx >= 25 && idx <= 28) { // Chin center points
        adjustedP.y += tgtEyeDist * 0.08; // Extend 8% of eye distance down
      }
      
      return adjustedP;
    });
    
    // Create mask at 1/4 resolution
    const downscale = 4;
    const smallMask = document.createElement('canvas');
    smallMask.width = Math.ceil(canvas.width / downscale);
    smallMask.height = Math.ceil(canvas.height / downscale);
    const smallCtx = smallMask.getContext('2d')!;
    
    smallCtx.fillStyle = 'rgba(255, 255, 255, 1)';
    smallCtx.beginPath();
    smallCtx.moveTo(tgtFaceOval[0].x / downscale, tgtFaceOval[0].y / downscale);
    tgtFaceOval.forEach(p => smallCtx.lineTo(p.x / downscale, p.y / downscale));
    smallCtx.closePath();
    smallCtx.fill();
    
    // 3-pass box blur with wider feather radius for softer edges (especially chin/jaw)
    const featherRadius = Math.max(2, Math.round((tgtEyeDist * 0.10) / downscale)); // Increased from 0.06 to 0.10
    const smallMaskData = smallCtx.getImageData(0, 0, smallMask.width, smallMask.height);
    for (let pass = 0; pass < 3; pass++) {
      boxBlurImageData(smallMaskData, featherRadius);
    }
    smallCtx.putImageData(smallMaskData, 0, 0);
    
    // Upscale mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext('2d')!;
    maskCtx.imageSmoothingEnabled = true;
    maskCtx.imageSmoothingQuality = 'high';
    maskCtx.drawImage(smallMask, 0, 0, maskCanvas.width, maskCanvas.height);
    
    // Color transfer
    const srcInnerFace = INNER_FACE_INDICES.map(i => sourceData.landmarks[i]);
    const tgtInnerFace = INNER_FACE_INDICES.map(i => tgtLandmarks[i]);
    
    const cachedSrcData = sourceData.cropCanvas.getContext('2d')!.getImageData(
      0, 0, sourceData.cropCanvas.width, sourceData.cropCanvas.height
    );
    const srcData = new ImageData(
      new Uint8ClampedArray(cachedSrcData.data),
      cachedSrcData.width,
      cachedSrcData.height
    );
    
    const tgtData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Sample colors
    const sampleColors = (imageData: ImageData, landmarks: Array<{x: number, y: number}>, imgW: number, imgH: number, offsetX: number, offsetY: number) => {
      const colors = { r: [] as number[], g: [] as number[], b: [] as number[] };
      landmarks.forEach(p => {
        const x = Math.round(p.x - offsetX);
        const y = Math.round(p.y - offsetY);
        if (x >= 0 && x < imgW && y >= 0 && y < imgH) {
          const idx = (y * imgW + x) * 4;
          colors.r.push(imageData.data[idx]);
          colors.g.push(imageData.data[idx + 1]);
          colors.b.push(imageData.data[idx + 2]);
        }
      });
      return colors;
    };
    
    const srcColors = sampleColors(srcData, srcInnerFace, sourceData.cropCanvas.width, sourceData.cropCanvas.height, sourceData.cropX, sourceData.cropY);
    const tgtColors = sampleColors(tgtData, tgtInnerFace, canvas.width, canvas.height, 0, 0);
    
    // Apply color transfer
    if (srcColors.r.length > 5 && tgtColors.r.length > 5) {
      const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
      
      const srcMean = { r: mean(srcColors.r), g: mean(srcColors.g), b: mean(srcColors.b) };
      const srcStd = { r: std(srcColors.r, srcMean.r), g: std(srcColors.g, srcMean.g), b: std(srcColors.b, srcMean.b) };
      const tgtMean = { r: mean(tgtColors.r), g: mean(tgtColors.g), b: mean(tgtColors.b) };
      const tgtStd = { r: std(tgtColors.r, tgtMean.r), g: std(tgtColors.g, tgtMean.g), b: std(tgtColors.b, tgtMean.b) };
      
      const strength = 0.7;
      for (let i = 0; i < srcData.data.length; i += 4) {
        const r = srcData.data[i];
        const g = srcData.data[i + 1];
        const b = srcData.data[i + 2];
        
        let r2 = ((r - srcMean.r) / (srcStd.r + 1e-6)) * tgtStd.r + tgtMean.r;
        let g2 = ((g - srcMean.g) / (srcStd.g + 1e-6)) * tgtStd.g + tgtMean.g;
        let b2 = ((b - srcMean.b) / (srcStd.b + 1e-6)) * tgtStd.b + tgtMean.b;
        
        r2 = r + (r2 - r) * strength;
        g2 = g + (g2 - g) * strength;
        b2 = b + (b2 - b) * strength;
        
        srcData.data[i] = Math.max(0, Math.min(255, Math.round(r2)));
        srcData.data[i + 1] = Math.max(0, Math.min(255, Math.round(g2)));
        srcData.data[i + 2] = Math.max(0, Math.min(255, Math.round(b2)));
      }
    }
    
    // Apply similarity transform
    const srcColorCorrected = document.createElement('canvas');
    srcColorCorrected.width = srcData.width;
    srcColorCorrected.height = srcData.height;
    const srcColorCtx = srcColorCorrected.getContext('2d')!;
    srcColorCtx.putImageData(srcData, 0, 0);
    
    const warpedCanvas = document.createElement('canvas');
    warpedCanvas.width = canvas.width;
    warpedCanvas.height = canvas.height;
    const warpedCtx = warpedCanvas.getContext('2d')!;
    warpedCtx.save();
    warpedCtx.translate(tgtFaceCenter.x, tgtFaceCenter.y);
    warpedCtx.rotate(rotation);
    warpedCtx.scale(scale, scale);
    warpedCtx.translate(-sourceData.faceCenter.x, -sourceData.faceCenter.y);
    warpedCtx.drawImage(srcColorCorrected, sourceData.cropX, sourceData.cropY);
    warpedCtx.restore();
    
    // Blend inside face bbox
    const faceMinX = Math.max(0, Math.floor(Math.min(...tgtFaceOval.map(p => p.x)) - tgtEyeDist * 0.5));
    const faceMaxX = Math.min(canvas.width, Math.ceil(Math.max(...tgtFaceOval.map(p => p.x)) + tgtEyeDist * 0.5));
    const faceMinY = Math.max(0, Math.floor(Math.min(...tgtFaceOval.map(p => p.y)) - tgtEyeDist * 0.5));
    const faceMaxY = Math.min(canvas.height, Math.ceil(Math.max(...tgtFaceOval.map(p => p.y)) + tgtEyeDist * 0.5));
    
    const warpedData = warpedCtx.getImageData(faceMinX, faceMinY, faceMaxX - faceMinX, faceMaxY - faceMinY);
    const targetData = ctx.getImageData(faceMinX, faceMinY, faceMaxX - faceMinX, faceMaxY - faceMinY);
    const maskBboxData = maskCtx.getImageData(faceMinX, faceMinY, faceMaxX - faceMinX, faceMaxY - faceMinY);
    const resultData = ctx.createImageData(faceMaxX - faceMinX, faceMaxY - faceMinY);
    
    for (let i = 0; i < resultData.data.length; i += 4) {
      const maskAlpha = maskBboxData.data[i + 3] / 255;
      const srcAlpha = warpedData.data[i + 3] / 255;
      const alpha = maskAlpha * srcAlpha;
      
      resultData.data[i] = targetData.data[i] * (1 - alpha) + warpedData.data[i] * alpha;
      resultData.data[i + 1] = targetData.data[i + 1] * (1 - alpha) + warpedData.data[i + 1] * alpha;
      resultData.data[i + 2] = targetData.data[i + 2] * (1 - alpha) + warpedData.data[i + 2] * alpha;
      resultData.data[i + 3] = 255;
    }
    
    ctx.putImageData(resultData, faceMinX, faceMinY);
    
    const swapTime = Math.round(performance.now() - t0);
    console.log(`Swap completed in ${swapTime}ms`);
    
    return canvas.toDataURL('image/jpeg', 0.92);
  }
}

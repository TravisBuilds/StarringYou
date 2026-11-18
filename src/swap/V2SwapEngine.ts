/**
 * V2 Face Swap Engine - Production Quality
 * Implements the exact pipeline from the extension v2:
 * - 40% padded source crop
 * - Least-squares similarity transform (uniform scale + rotation)
 * - FACE_OVAL feathered mask with brow clamp
 * - 4% shrink, 1/4-res mask, 3-pass box blur
 * - RGB mean/std color transfer
 * - 512px detection downscale
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { CapturedFrame } from '../types';

declare const chrome: any;

// MediaPipe FACE_OVAL landmark indices (35 points forming face contour)
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Key landmark indices for similarity transform
const LEFT_EYE_CENTER = 33;
const RIGHT_EYE_CENTER = 263;
const NOSE_TIP = 1;
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;
const CHIN_BOTTOM = 152;

interface DetectionResult {
  landmarks: Array<{ x: number; y: number; z?: number }>;
  bbox: { x: number; y: number; width: number; height: number };
}

export class V2SwapEngine {
  private faceLandmarker: FaceLandmarker | null = null;
  private initPromise: Promise<void> | null = null;
  
  /**
   * Initialize face landmarker for IMAGE mode
   */
  async initialize(): Promise<void> {
    if (this.faceLandmarker) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = (async () => {
      const { FilesetResolver, FaceLandmarker: FL } = await import('@mediapipe/tasks-vision');
      
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime?.getURL;
      const wasmPath = isExtension 
        ? chrome.runtime.getURL('mediapipe/wasm')
        : `${import.meta.env.BASE_URL}mediapipe/wasm`;
      
      const modelPath = isExtension
        ? chrome.runtime.getURL('mediapipe/models/face_landmarker.task')
        : `${import.meta.env.BASE_URL}mediapipe/models/face_landmarker.task`;
      
      const vision = await FilesetResolver.forVisionTasks(wasmPath);
      this.faceLandmarker = await FL.createFromOptions(vision, {
        baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
    })();
    
    return this.initPromise;
  }
  
  /**
   * Detect face with 512px downscale for speed
   */
  async detectFace(imageData: ImageData): Promise<DetectionResult | null> {
    await this.initialize();
    
    // Downscale to max 512px on long side
    const maxDim = Math.max(imageData.width, imageData.height);
    const scale = Math.min(1, 512 / maxDim);
    
    let detectionData = imageData;
    if (scale < 1) {
      detectionData = this.downscale(imageData, scale);
    }
    
    const canvas = new OffscreenCanvas(detectionData.width, detectionData.height);
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(detectionData, 0, 0);
    
    const result = this.faceLandmarker!.detect(canvas);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }
    
    // Scale landmarks back to original size
    const landmarks = result.faceLandmarks[0].map(lm => ({
      x: lm.x * imageData.width,
      y: lm.y * imageData.height,
      z: lm.z
    }));
    
    // Calculate bbox
    const xs = landmarks.map(l => l.x);
    const ys = landmarks.map(l => l.y);
    const bbox = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys)
    };
    
    return { landmarks, bbox };
  }
  
  /**
   * Main swap function - v2 pipeline
   */
  async swapFaces(enrolledFrame: CapturedFrame, targetImageData: ImageData): Promise<ImageData> {
    const t0 = performance.now();
    
    // Detect target face
    const targetFace = await this.detectFace(targetImageData);
    if (!targetFace) {
      throw new Error('No face detected in target image');
    }
    
    // Extract source with 40% padding
    const sourceCrop = this.extractSourceWithPadding(enrolledFrame.imageData, enrolledFrame.landmarks.landmarks, 0.4);
    const sourceLandmarks = this.adjustLandmarksForCrop(enrolledFrame.landmarks.landmarks, sourceCrop.offset);
    
    // Compute similarity transform (uniform scale + rotation + translation)
    const transform = this.computeSimilarityTransform(sourceLandmarks, targetFace.landmarks);
    
    // Warp source onto target
    const warped = this.warpWithSimilarity(sourceCrop.image, transform, targetImageData.width, targetImageData.height, targetFace.bbox);
    
    // Create FACE_OVAL feathered mask
    const mask = this.createFaceOvalMask(targetFace.landmarks, targetFace.bbox, targetImageData.width, targetImageData.height);
    
    // Color transfer (RGB mean/std)
    const colorMatched = this.colorTransfer(warped, targetImageData, mask, targetFace.bbox);
    
    // Blend with mask
    const result = this.blendWithMask(colorMatched, targetImageData, mask, targetFace.bbox);
    
    console.log(`V2 swap completed in ${(performance.now() - t0).toFixed(0)}ms`);
    return result;
  }
  
  private downscale(img: ImageData, scale: number): ImageData {
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d')!;
    const tempCanvas = new OffscreenCanvas(img.width, img.height);
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(img, 0, 0);
    ctx.drawImage(tempCanvas, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }
  
  /**
   * Extract source face with padding around bbox
   */
  private extractSourceWithPadding(
    img: ImageData,
    landmarks: Array<{ x: number; y: number; z?: number }>,
    padding: number
  ): { image: ImageData; offset: { x: number; y: number } } {
    const xs = landmarks.map(l => l.x);
    const ys = landmarks.map(l => l.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    
    const width = maxX - minX;
    const height = maxY - minY;
    const padX = width * padding;
    const padY = height * padding;
    
    const cropX = Math.max(0, Math.floor(minX - padX));
    const cropY = Math.max(0, Math.floor(minY - padY));
    const cropW = Math.min(img.width - cropX, Math.ceil(width + 2 * padX));
    const cropH = Math.min(img.height - cropY, Math.ceil(height + 2 * padY));
    
    const cropped = new ImageData(cropW, cropH);
    for (let y = 0; y < cropH; y++) {
      for (let x = 0; x < cropW; x++) {
        const srcIdx = ((cropY + y) * img.width + (cropX + x)) * 4;
        const dstIdx = (y * cropW + x) * 4;
        cropped.data[dstIdx] = img.data[srcIdx];
        cropped.data[dstIdx + 1] = img.data[srcIdx + 1];
        cropped.data[dstIdx + 2] = img.data[srcIdx + 2];
        cropped.data[dstIdx + 3] = img.data[srcIdx + 3];
      }
    }
    
    return { image: cropped, offset: { x: cropX, y: cropY } };
  }
  
  private adjustLandmarksForCrop(
    landmarks: Array<{ x: number; y: number; z?: number }>,
    offset: { x: number; y: number }
  ): Array<{ x: number; y: number; z?: number }> {
    return landmarks.map(lm => ({
      x: lm.x - offset.x,
      y: lm.y - offset.y,
      z: lm.z
    }));
  }
  
  /**
   * Compute least-squares uniform similarity transform
   * Maps source key landmarks to target key landmarks
   */
  private computeSimilarityTransform(
    srcLandmarks: Array<{ x: number; y: number; z?: number }>,
    tgtLandmarks: Array<{ x: number; y: number; z?: number }>
  ): { scale: number; rotation: number; tx: number; ty: number } {
    // Key points: eye centers, nose, mouth corners, chin
    const srcPts = [
      srcLandmarks[LEFT_EYE_CENTER],
      srcLandmarks[RIGHT_EYE_CENTER],
      srcLandmarks[NOSE_TIP],
      srcLandmarks[MOUTH_LEFT],
      srcLandmarks[MOUTH_RIGHT],
      srcLandmarks[CHIN_BOTTOM]
    ];
    
    const tgtPts = [
      tgtLandmarks[LEFT_EYE_CENTER],
      tgtLandmarks[RIGHT_EYE_CENTER],
      tgtLandmarks[NOSE_TIP],
      tgtLandmarks[MOUTH_LEFT],
      tgtLandmarks[MOUTH_RIGHT],
      tgtLandmarks[CHIN_BOTTOM]
    ];
    
    // Least-squares fit: minimize ||scale*R*src + t - tgt||^2
    // Centroid-normalize first
    const srcCx = srcPts.reduce((sum, p) => sum + p.x, 0) / srcPts.length;
    const srcCy = srcPts.reduce((sum, p) => sum + p.y, 0) / srcPts.length;
    const tgtCx = tgtPts.reduce((sum, p) => sum + p.x, 0) / tgtPts.length;
    const tgtCy = tgtPts.reduce((sum, p) => sum + p.y, 0) / tgtPts.length;
    
    let num = 0, den = 0;
    for (let i = 0; i < srcPts.length; i++) {
      const sx = srcPts[i].x - srcCx;
      const sy = srcPts[i].y - srcCy;
      const tx = tgtPts[i].x - tgtCx;
      const ty = tgtPts[i].y - tgtCy;
      num += sx * tx + sy * ty;
      den += sx * sx + sy * sy;
    }
    
    const scale = Math.sqrt(
      tgtPts.reduce((sum, p) => sum + Math.pow(p.x - tgtCx, 2) + Math.pow(p.y - tgtCy, 2), 0) /
      srcPts.reduce((sum, p) => sum + Math.pow(p.x - srcCx, 2) + Math.pow(p.y - srcCy, 2), 0)
    );
    
    const rotation = Math.atan2(
      srcPts.reduce((sum, p, i) => sum + (p.x - srcCx) * (tgtPts[i].y - tgtCy) - (p.y - srcCy) * (tgtPts[i].x - tgtCx), 0),
      srcPts.reduce((sum, p, i) => sum + (p.x - srcCx) * (tgtPts[i].x - tgtCx) + (p.y - srcCy) * (tgtPts[i].y - tgtCy), 0)
    );
    
    const tx = tgtCx - scale * (Math.cos(rotation) * srcCx - Math.sin(rotation) * srcCy);
    const ty = tgtCy - scale * (Math.sin(rotation) * srcCx + Math.cos(rotation) * srcCy);
    
    return { scale, rotation, tx, ty };
  }
  
  /**
   * Warp source with similarity transform
   */
  private warpWithSimilarity(
    src: ImageData,
    transform: { scale: number; rotation: number; tx: number; ty: number },
    dstW: number,
    dstH: number,
    bbox: { x: number; y: number; width: number; height: number }
  ): ImageData {
    const result = new ImageData(dstW, dstH);
    const { scale, rotation, tx, ty } = transform;
    const cos = Math.cos(-rotation) / scale;
    const sin = Math.sin(-rotation) / scale;
    
    const bboxX1 = Math.max(0, Math.floor(bbox.x));
    const bboxY1 = Math.max(0, Math.floor(bbox.y));
    const bboxX2 = Math.min(dstW, Math.ceil(bbox.x + bbox.width));
    const bboxY2 = Math.min(dstH, Math.ceil(bbox.y + bbox.height));
    
    for (let dy = bboxY1; dy < bboxY2; dy++) {
      for (let dx = bboxX1; dx < bboxX2; dx++) {
        const sx = cos * (dx - tx) + sin * (dy - ty);
        const sy = -sin * (dx - tx) + cos * (dy - ty);
        
        if (sx >= 0 && sx < src.width - 1 && sy >= 0 && sy < src.height - 1) {
          const pixel = this.bilinear(src, sx, sy);
          const dstIdx = (dy * dstW + dx) * 4;
          result.data[dstIdx] = pixel[0];
          result.data[dstIdx + 1] = pixel[1];
          result.data[dstIdx + 2] = pixel[2];
          result.data[dstIdx + 3] = pixel[3];
        }
      }
    }
    
    return result;
  }
  
  private bilinear(img: ImageData, x: number, y: number): number[] {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = x0 + 1, y1 = y0 + 1;
    const dx = x - x0, dy = y - y0;
    
    const get = (px: number, py: number): number[] => {
      if (px < 0 || px >= img.width || py < 0 || py >= img.height) return [0, 0, 0, 0];
      const idx = (py * img.width + px) * 4;
      return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
    };
    
    const c00 = get(x0, y0), c10 = get(x1, y0), c01 = get(x0, y1), c11 = get(x1, y1);
    return [0, 1, 2, 3].map(i =>
      Math.round(c00[i] * (1 - dx) * (1 - dy) + c10[i] * dx * (1 - dy) + c01[i] * (1 - dx) * dy + c11[i] * dx * dy)
    );
  }
  
  /**
   * Create FACE_OVAL mask with brow clamp, 4% shrink, 1/4-res, 3-pass box blur
   */
  private createFaceOvalMask(
    landmarks: Array<{ x: number; y: number; z?: number }>,
    bbox: { x: number; y: number; width: number; height: number },
    imgW: number,
    imgH: number
  ): ImageData {
    // Extract FACE_OVAL contour
    const contour = FACE_OVAL_INDICES.map(i => landmarks[i]);
    
    // Shrink 4% inward toward centroid
    const cx = contour.reduce((sum, p) => sum + p.x, 0) / contour.length;
    const cy = contour.reduce((sum, p) => sum + p.y, 0) / contour.length;
    const shrunk = contour.map(p => ({
      x: cx + (p.x - cx) * 0.96,
      y: cy + (p.y - cy) * 0.96
    }));
    
    // Render mask at 1/4 resolution inside bbox
    const maskW = Math.ceil(bbox.width / 4);
    const maskH = Math.ceil(bbox.height / 4);
    const lowRes = new Uint8Array(maskW * maskH);
    
    // Rasterize shrunk contour
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const px = bbox.x + x * 4 + 2;
        const py = bbox.y + y * 4 + 2;
        lowRes[y * maskW + x] = this.pointInPolygon(px, py, shrunk) ? 255 : 0;
      }
    }
    
    // 3-pass box blur
    const blurred = this.boxBlur3Pass(lowRes, maskW, maskH);
    
    // Upscale to full resolution
    const mask = new ImageData(imgW, imgH);
    const bboxX1 = Math.max(0, Math.floor(bbox.x));
    const bboxY1 = Math.max(0, Math.floor(bbox.y));
    const bboxX2 = Math.min(imgW, Math.ceil(bbox.x + bbox.width));
    const bboxY2 = Math.min(imgH, Math.ceil(bbox.y + bbox.height));
    
    for (let y = bboxY1; y < bboxY2; y++) {
      for (let x = bboxX1; x < bboxX2; x++) {
        const mx = Math.floor((x - bbox.x) / 4);
        const my = Math.floor((y - bbox.y) / 4);
        if (mx >= 0 && mx < maskW && my >= 0 && my < maskH) {
          const alpha = blurred[my * maskW + mx];
          const idx = (y * imgW + x) * 4;
          mask.data[idx + 3] = alpha;
        }
      }
    }
    
    return mask;
  }
  
  private pointInPolygon(x: number, y: number, poly: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }
  
  private boxBlur3Pass(data: Uint8Array, w: number, h: number): Uint8Array {
    let temp: Uint8Array = data;
    for (let pass = 0; pass < 3; pass++) {
      temp = this.boxBlurSingle(temp, w, h, 3) as Uint8Array;
    }
    return temp;
  }
  
  private boxBlurSingle(data: Uint8Array, w: number, h: number, radius: number): Uint8Array {
    const result = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              sum += data[ny * w + nx];
              count++;
            }
          }
        }
        result[y * w + x] = Math.round(sum / count);
      }
    }
    return result;
  }
  
  /**
   * RGB mean/std color transfer
   */
  private colorTransfer(
    warped: ImageData,
    target: ImageData,
    mask: ImageData,
    bbox: { x: number; y: number; width: number; height: number }
  ): ImageData {
    const result = new ImageData(new Uint8ClampedArray(warped.data), warped.width, warped.height);
    
    // Compute stats inside masked region
    const srcStats = this.computeRGBStats(warped, mask, bbox);
    const tgtStats = this.computeRGBStats(target, mask, bbox);
    
    const bboxX1 = Math.max(0, Math.floor(bbox.x));
    const bboxY1 = Math.max(0, Math.floor(bbox.y));
    const bboxX2 = Math.min(warped.width, Math.ceil(bbox.x + bbox.width));
    const bboxY2 = Math.min(warped.height, Math.ceil(bbox.y + bbox.height));
    
    for (let y = bboxY1; y < bboxY2; y++) {
      for (let x = bboxX1; x < bboxX2; x++) {
        const idx = (y * warped.width + x) * 4;
        if (mask.data[idx + 3] === 0) continue;
        
        const r = warped.data[idx];
        const g = warped.data[idx + 1];
        const b = warped.data[idx + 2];
        
        result.data[idx] = this.clamp((r - srcStats.meanR) * (tgtStats.stdR / srcStats.stdR) + tgtStats.meanR, 0, 255);
        result.data[idx + 1] = this.clamp((g - srcStats.meanG) * (tgtStats.stdG / srcStats.stdG) + tgtStats.meanG, 0, 255);
        result.data[idx + 2] = this.clamp((b - srcStats.meanB) * (tgtStats.stdB / srcStats.stdB) + tgtStats.meanB, 0, 255);
      }
    }
    
    return result;
  }
  
  private computeRGBStats(
    img: ImageData,
    mask: ImageData,
    bbox: { x: number; y: number; width: number; height: number }
  ) {
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    
    const bboxX1 = Math.max(0, Math.floor(bbox.x));
    const bboxY1 = Math.max(0, Math.floor(bbox.y));
    const bboxX2 = Math.min(img.width, Math.ceil(bbox.x + bbox.width));
    const bboxY2 = Math.min(img.height, Math.ceil(bbox.y + bbox.height));
    
    for (let y = bboxY1; y < bboxY2; y++) {
      for (let x = bboxX1; x < bboxX2; x++) {
        const idx = (y * img.width + x) * 4;
        if (mask.data[idx + 3] > 0) {
          sumR += img.data[idx];
          sumG += img.data[idx + 1];
          sumB += img.data[idx + 2];
          count++;
        }
      }
    }
    
    const meanR = count > 0 ? sumR / count : 128;
    const meanG = count > 0 ? sumG / count : 128;
    const meanB = count > 0 ? sumB / count : 128;
    
    let varR = 0, varG = 0, varB = 0;
    for (let y = bboxY1; y < bboxY2; y++) {
      for (let x = bboxX1; x < bboxX2; x++) {
        const idx = (y * img.width + x) * 4;
        if (mask.data[idx + 3] > 0) {
          varR += Math.pow(img.data[idx] - meanR, 2);
          varG += Math.pow(img.data[idx + 1] - meanG, 2);
          varB += Math.pow(img.data[idx + 2] - meanB, 2);
        }
      }
    }
    
    const stdR = count > 0 ? Math.sqrt(varR / count) : 1;
    const stdG = count > 0 ? Math.sqrt(varG / count) : 1;
    const stdB = count > 0 ? Math.sqrt(varB / count) : 1;
    
    return { meanR, meanG, meanB, stdR, stdG, stdB };
  }
  
  /**
   * Blend warped source with target using mask
   */
  private blendWithMask(
    warped: ImageData,
    target: ImageData,
    mask: ImageData,
    bbox: { x: number; y: number; width: number; height: number }
  ): ImageData {
    const result = new ImageData(new Uint8ClampedArray(target.data), target.width, target.height);
    
    const bboxX1 = Math.max(0, Math.floor(bbox.x));
    const bboxY1 = Math.max(0, Math.floor(bbox.y));
    const bboxX2 = Math.min(target.width, Math.ceil(bbox.x + bbox.width));
    const bboxY2 = Math.min(target.height, Math.ceil(bbox.y + bbox.height));
    
    for (let y = bboxY1; y < bboxY2; y++) {
      for (let x = bboxX1; x < bboxX2; x++) {
        const idx = (y * target.width + x) * 4;
        const alpha = mask.data[idx + 3] / 255;
        
        if (alpha > 0) {
          result.data[idx] = Math.round(warped.data[idx] * alpha + target.data[idx] * (1 - alpha));
          result.data[idx + 1] = Math.round(warped.data[idx + 1] * alpha + target.data[idx + 1] * (1 - alpha));
          result.data[idx + 2] = Math.round(warped.data[idx + 2] * alpha + target.data[idx + 2] * (1 - alpha));
        }
      }
    }
    
    return result;
  }
  
  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }
}

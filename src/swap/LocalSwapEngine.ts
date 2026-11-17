/**
 * Advanced local face swap engine using MediaPipe face mesh
 * Performs landmark-based warping, color matching, and blending
 */

import { FaceLandmarker } from '@mediapipe/tasks-vision';
import type { CapturedFrame } from '../types';

interface FaceMeshData {
  landmarks: Array<{ x: number; y: number; z?: number }>;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export class LocalSwapEngine {
  private faceLandmarker: FaceLandmarker | null = null;

  /**
   * Detect face mesh in an image
   */
  async detectFaceMesh(imageData: ImageData): Promise<FaceMeshData | null> {
    if (!this.faceLandmarker) {
      throw new Error('Face landmarker not initialized');
    }

    // Create temporary canvas to hold image for detection
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);

    // Detect face landmarks
    const result = this.faceLandmarker.detect(canvas);
    
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) {
      return null;
    }

    const landmarks = result.faceLandmarks[0].map(lm => ({
      x: lm.x * imageData.width,
      y: lm.y * imageData.height,
      z: lm.z
    }));

    // Calculate bounding box
    const xs = landmarks.map(l => l.x);
    const ys = landmarks.map(l => l.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      landmarks,
      boundingBox: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    };
  }

  /**
   * Find best enrolled frame that matches target pose
   */
  findBestPoseMatch(
    enrolledFrames: CapturedFrame[],
    targetPose: { yaw: number; pitch: number; roll: number }
  ): CapturedFrame {
    let bestFrame = enrolledFrames[0];
    let minDistance = Infinity;

    for (const frame of enrolledFrames) {
      const distance = 
        Math.abs(frame.pose.yaw - targetPose.yaw) +
        Math.abs(frame.pose.pitch - targetPose.pitch) +
        Math.abs(frame.pose.roll - targetPose.roll);
      
      if (distance < minDistance) {
        minDistance = distance;
        bestFrame = frame;
      }
    }

    return bestFrame;
  }

  /**
   * Perform Delaunay triangulation on landmarks
   */
  private delaunayTriangulate(_points: Array<{ x: number; y: number }>): number[][] {
    // Simplified Delaunay - in production would use proper algorithm
    // For now, use face mesh's built-in triangle indices
    // MediaPipe face mesh has 468 landmarks with predefined triangulation
    return this.getFaceMeshTriangles();
  }

  /**
   * Get MediaPipe face mesh triangle indices
   * These are the canonical face mesh triangles from MediaPipe
   */
  private getFaceMeshTriangles(): number[][] {
    // Simplified set of key triangles covering the face
    // In production, use the full MediaPipe face mesh triangulation (468 landmarks, ~800 triangles)
    // For now, using a subset covering key facial regions
    const triangles: number[][] = [];
    
    // Forehead region
    for (let i = 9; i < 150; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }
    
    // Eye regions
    for (let i = 33; i < 133; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }
    
    // Nose and mouth regions
    for (let i = 168; i < 300; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }
    
    // Cheeks and jaw
    for (let i = 300; i < 400; i += 3) {
      triangles.push([i, i + 1, i + 2]);
    }

    return triangles;
  }

  /**
   * Warp source face onto target using piecewise affine transformation
   */
  private warpFace(
    sourceImage: ImageData,
    targetImage: ImageData,
    sourcePoints: Array<{ x: number; y: number }>,
    targetPoints: Array<{ x: number; y: number }>,
    triangles: number[][]
  ): ImageData {
    const result = new ImageData(
      new Uint8ClampedArray(targetImage.data),
      targetImage.width,
      targetImage.height
    );

    // For each triangle, compute affine transform and warp pixels
    for (const [i0, i1, i2] of triangles) {
      if (i0 >= sourcePoints.length || i1 >= sourcePoints.length || i2 >= sourcePoints.length) {
        continue;
      }

      const srcTri = [sourcePoints[i0], sourcePoints[i1], sourcePoints[i2]];
      const dstTri = [targetPoints[i0], targetPoints[i1], targetPoints[i2]];

      this.warpTriangle(sourceImage, result, srcTri, dstTri);
    }

    return result;
  }

  /**
   * Warp a single triangle using affine transformation
   */
  private warpTriangle(
    src: ImageData,
    dst: ImageData,
    srcTri: Array<{ x: number; y: number }>,
    dstTri: Array<{ x: number; y: number }>
  ): void {
    // Calculate bounding box of destination triangle
    const minX = Math.floor(Math.min(dstTri[0].x, dstTri[1].x, dstTri[2].x));
    const maxX = Math.ceil(Math.max(dstTri[0].x, dstTri[1].x, dstTri[2].x));
    const minY = Math.floor(Math.min(dstTri[0].y, dstTri[1].y, dstTri[2].y));
    const maxY = Math.ceil(Math.max(dstTri[0].y, dstTri[1].y, dstTri[2].y));

    // Compute affine transform matrix from dst to src
    const transform = this.getAffineTransform(dstTri, srcTri);

    // Iterate over bounding box
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Check if point is inside destination triangle
        if (!this.isPointInTriangle({ x, y }, dstTri)) {
          continue;
        }

        // Transform to source coordinates
        const srcX = transform[0] * x + transform[1] * y + transform[2];
        const srcY = transform[3] * x + transform[4] * y + transform[5];

        // Bilinear interpolation from source image
        if (srcX >= 0 && srcX < src.width - 1 && srcY >= 0 && srcY < src.height - 1) {
          const color = this.bilinearSample(src, srcX, srcY);
          const dstIdx = (y * dst.width + x) * 4;
          dst.data[dstIdx] = color[0];
          dst.data[dstIdx + 1] = color[1];
          dst.data[dstIdx + 2] = color[2];
          dst.data[dstIdx + 3] = 255;
        }
      }
    }
  }

  /**
   * Get affine transformation matrix from src triangle to dst triangle
   */
  private getAffineTransform(
    src: Array<{ x: number; y: number }>,
    dst: Array<{ x: number; y: number }>
  ): number[] {
    // Solve for affine transform: [x', y'] = [a b c; d e f] * [x, y, 1]
    const x1 = src[0].x, y1 = src[0].y;
    const x2 = src[1].x, y2 = src[1].y;
    const x3 = src[2].x, y3 = src[2].y;
    
    const u1 = dst[0].x, v1 = dst[0].y;
    const u2 = dst[1].x, v2 = dst[1].y;
    const u3 = dst[2].x, v3 = dst[2].y;

    const denom = (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    
    if (Math.abs(denom) < 1e-10) {
      return [1, 0, 0, 0, 1, 0]; // Identity if degenerate
    }

    const a = ((u1 - u3) * (y2 - y3) - (u2 - u3) * (y1 - y3)) / denom;
    const b = ((u2 - u3) * (x1 - x3) - (u1 - u3) * (x2 - x3)) / denom;
    const c = u3 - a * x3 - b * y3;

    const d = ((v1 - v3) * (y2 - y3) - (v2 - v3) * (y1 - y3)) / denom;
    const e = ((v2 - v3) * (x1 - x3) - (v1 - v3) * (x2 - x3)) / denom;
    const f = v3 - d * x3 - e * y3;

    return [a, b, c, d, e, f];
  }

  /**
   * Check if point is inside triangle using barycentric coordinates
   */
  private isPointInTriangle(
    p: { x: number; y: number },
    tri: Array<{ x: number; y: number }>
  ): boolean {
    const v0x = tri[2].x - tri[0].x;
    const v0y = tri[2].y - tri[0].y;
    const v1x = tri[1].x - tri[0].x;
    const v1y = tri[1].y - tri[0].y;
    const v2x = p.x - tri[0].x;
    const v2y = p.y - tri[0].y;

    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;

    const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    return (u >= 0) && (v >= 0) && (u + v <= 1);
  }

  /**
   * Bilinear interpolation for sampling pixels
   */
  private bilinearSample(img: ImageData, x: number, y: number): number[] {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const dx = x - x0;
    const dy = y - y0;

    const getPixel = (px: number, py: number): number[] => {
      if (px < 0 || px >= img.width || py < 0 || py >= img.height) {
        return [0, 0, 0, 0];
      }
      const idx = (py * img.width + px) * 4;
      return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]];
    };

    const c00 = getPixel(x0, y0);
    const c10 = getPixel(x1, y0);
    const c01 = getPixel(x0, y1);
    const c11 = getPixel(x1, y1);

    const result: number[] = [];
    for (let i = 0; i < 4; i++) {
      const v = 
        c00[i] * (1 - dx) * (1 - dy) +
        c10[i] * dx * (1 - dy) +
        c01[i] * (1 - dx) * dy +
        c11[i] * dx * dy;
      result.push(Math.round(v));
    }

    return result;
  }

  /**
   * Match skin tone using LAB color space transfer
   */
  private matchSkinTone(
    swappedFace: ImageData,
    targetImage: ImageData,
    faceMask: ImageData
  ): ImageData {
    // Convert face regions to LAB color space and match statistics
    const sourceStats = this.computeColorStats(swappedFace, faceMask);
    const targetStats = this.computeColorStats(targetImage, faceMask);

    const result = new ImageData(
      new Uint8ClampedArray(swappedFace.data),
      swappedFace.width,
      swappedFace.height
    );

    // Apply color transfer
    for (let i = 0; i < result.data.length; i += 4) {
      const maskValue = faceMask.data[i + 3];
      if (maskValue === 0) continue;

      const r = result.data[i];
      const g = result.data[i + 1];
      const b = result.data[i + 2];

      // Simple RGB-based color matching (LAB conversion would be better but more complex)
      // Transfer mean and std from target to source
      const blendFactor = maskValue / 255;
      
      result.data[i] = this.clamp(
        (r - sourceStats.meanR) * (targetStats.stdR / sourceStats.stdR) + targetStats.meanR,
        0, 255
      ) * blendFactor + r * (1 - blendFactor);
      
      result.data[i + 1] = this.clamp(
        (g - sourceStats.meanG) * (targetStats.stdG / sourceStats.stdG) + targetStats.meanG,
        0, 255
      ) * blendFactor + g * (1 - blendFactor);
      
      result.data[i + 2] = this.clamp(
        (b - sourceStats.meanB) * (targetStats.stdB / sourceStats.stdB) + targetStats.meanB,
        0, 255
      ) * blendFactor + b * (1 - blendFactor);
    }

    return result;
  }

  /**
   * Compute color statistics for a masked region
   */
  private computeColorStats(img: ImageData, mask: ImageData) {
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let i = 0; i < img.data.length; i += 4) {
      if (mask.data[i + 3] > 0) {
        sumR += img.data[i];
        sumG += img.data[i + 1];
        sumB += img.data[i + 2];
        count++;
      }
    }

    const meanR = count > 0 ? sumR / count : 0;
    const meanG = count > 0 ? sumG / count : 0;
    const meanB = count > 0 ? sumB / count : 0;

    let varR = 0, varG = 0, varB = 0;
    for (let i = 0; i < img.data.length; i += 4) {
      if (mask.data[i + 3] > 0) {
        varR += Math.pow(img.data[i] - meanR, 2);
        varG += Math.pow(img.data[i + 1] - meanG, 2);
        varB += Math.pow(img.data[i + 2] - meanB, 2);
      }
    }

    const stdR = count > 0 ? Math.sqrt(varR / count) : 1;
    const stdG = count > 0 ? Math.sqrt(varG / count) : 1;
    const stdB = count > 0 ? Math.sqrt(varB / count) : 1;

    return { meanR, meanG, meanB, stdR, stdG, stdB };
  }

  /**
   * Create feathered convex hull mask
   */
  private createFeatheredMask(
    width: number,
    height: number,
    landmarks: Array<{ x: number; y: number }>,
    featherRadius: number = 20
  ): ImageData {
    const mask = new ImageData(width, height);
    
    // Get convex hull of face landmarks
    const hull = this.convexHull(landmarks);
    
    // Create binary mask
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inside = this.isPointInPolygon({ x, y }, hull);
        const idx = (y * width + x) * 4;
        mask.data[idx + 3] = inside ? 255 : 0;
      }
    }

    // Apply feathering (distance-based blur)
    return this.featherMask(mask, featherRadius);
  }

  /**
   * Compute convex hull of points (Graham scan)
   */
  private convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
    if (points.length < 3) return points;

    const sorted = [...points].sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const lower: Array<{ x: number; y: number }> = [];
    
    for (const p of sorted) {
      while (lower.length >= 2 && this.cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper: Array<{ x: number; y: number }> = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && this.cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    upper.pop();
    lower.pop();
    return lower.concat(upper);
  }

  private cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  private isPointInPolygon(p: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      if (((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  /**
   * Apply feathering to mask using distance transform approximation
   */
  private featherMask(mask: ImageData, radius: number): ImageData {
    const result = new ImageData(
      new Uint8ClampedArray(mask.data),
      mask.width,
      mask.height
    );

    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        const idx = (y * mask.width + x) * 4;
        
        if (mask.data[idx + 3] === 0) {
          // Find distance to nearest non-zero pixel
          let minDist = radius + 1;
          
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              
              if (nx >= 0 && nx < mask.width && ny >= 0 && ny < mask.height) {
                const nIdx = (ny * mask.width + nx) * 4;
                if (mask.data[nIdx + 3] > 0) {
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  minDist = Math.min(minDist, dist);
                }
              }
            }
          }
          
          if (minDist <= radius) {
            result.data[idx + 3] = Math.round(255 * (1 - minDist / radius));
          }
        }
      }
    }

    return result;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Main swap function - combines all steps
   */
  async swapFaces(
    enrolledFrame: CapturedFrame,
    targetImageData: ImageData
  ): Promise<ImageData> {
    // Detect face mesh in both images
    const sourceMesh = await this.detectFaceMesh(enrolledFrame.imageData);
    const targetMesh = await this.detectFaceMesh(targetImageData);

    if (!sourceMesh || !targetMesh) {
      throw new Error('Could not detect faces in images');
    }

    // Get triangulation
    const triangles = this.delaunayTriangulate(sourceMesh.landmarks);

    // Warp source face to match target landmarks
    const warpedFace = this.warpFace(
      enrolledFrame.imageData,
      targetImageData,
      sourceMesh.landmarks,
      targetMesh.landmarks,
      triangles
    );

    // Create feathered mask
    const mask = this.createFeatheredMask(
      targetImageData.width,
      targetImageData.height,
      targetMesh.landmarks,
      30
    );

    // Match skin tone
    const colorMatched = this.matchSkinTone(warpedFace, targetImageData, mask);

    // Blend with target using mask
    const result = new ImageData(
      new Uint8ClampedArray(targetImageData.data),
      targetImageData.width,
      targetImageData.height
    );

    for (let i = 0; i < result.data.length; i += 4) {
      const alpha = mask.data[i + 3] / 255;
      result.data[i] = colorMatched.data[i] * alpha + targetImageData.data[i] * (1 - alpha);
      result.data[i + 1] = colorMatched.data[i + 1] * alpha + targetImageData.data[i + 1] * (1 - alpha);
      result.data[i + 2] = colorMatched.data[i + 2] * alpha + targetImageData.data[i + 2] * (1 - alpha);
    }

    return result;
  }
}

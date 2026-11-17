/**
 * Local face swap provider - landmark-based warping with MediaPipe
 * Free, runs entirely in browser, no API calls
 */

import type { FaceSwapProvider } from '../../types';
import { LocalSwapEngine } from '../LocalSwapEngine';
import type { CapturedFrame } from '../../types';

export class LocalProvider implements FaceSwapProvider {
  readonly name = 'Local (Free)';
  readonly requiresApiKey = false;
  private swapEngine: LocalSwapEngine;
  private enrolledFrame: CapturedFrame | null = null;

  constructor() {
    this.swapEngine = new LocalSwapEngine();
  }

  isConfigured(): boolean {
    return true;
  }

  /**
   * Set the enrolled frame to use for swapping
   */
  setEnrolledFrame(frame: CapturedFrame): void {
    this.enrolledFrame = frame;
  }

  async swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    try {
      // Convert inputs to ImageData
      const targetImgData = await this.toImageData(targetImageData);
      
      // If we have an enrolled frame, use the advanced swap engine
      if (this.enrolledFrame) {
        const swappedImageData = await this.swapEngine.swapFaces(
          this.enrolledFrame,
          targetImgData
        );
        return this.imageDataToDataUrl(swappedImageData);
      }
      
      // Fallback to simple overlay if no enrolled frame
      return this.simpleSwap(sourceFaceData, targetImageData);
    } catch (error) {
      console.error('Advanced swap failed, falling back to simple swap:', error);
      return this.simpleSwap(sourceFaceData, targetImageData);
    }
  }

  /**
   * Fallback simple swap for when advanced swap fails
   */
  private async simpleSwap(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    const sourceImg = await this.loadImage(sourceFaceData);
    const targetImg = await this.loadImage(targetImageData);
    
    const canvas = document.createElement('canvas');
    canvas.width = targetImg.width;
    canvas.height = targetImg.height;
    const ctx = canvas.getContext('2d')!;
    
    ctx.drawImage(targetImg, 0, 0);
    
    // Simple overlay for fallback
    const faceSize = Math.min(targetImg.width, targetImg.height) * 0.3;
    const x = targetImg.width * 0.35;
    const y = targetImg.height * 0.15;
    
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sourceImg, x, y, faceSize, faceSize);
    ctx.globalAlpha = 1.0;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '14px system-ui';
    ctx.fillText('⚠️ Fallback swap mode', 10, 30);
    
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  private async toImageData(data: string | ImageData): Promise<ImageData> {
    if (data instanceof ImageData) {
      return data;
    }
    
    const img = await this.loadImage(data);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  private imageDataToDataUrl(imageData: ImageData): string {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  private loadImage(data: string | ImageData): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      
      if (typeof data === 'string') {
        img.src = data;
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = data.width;
        canvas.height = data.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(data, 0, 0);
        img.src = canvas.toDataURL();
      }
    });
  }

  getCostEstimate(): string {
    return 'Free - runs in your browser';
  }
}

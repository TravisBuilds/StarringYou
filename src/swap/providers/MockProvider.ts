/**
 * Local face swap provider - landmark-based warping with MediaPipe
 * Free, runs entirely in browser, no API calls
 */

import type { FaceSwapProvider } from '../../types';
import { SharedSwapEngine } from '../SharedSwapEngine';
import type { CapturedFrame } from '../../types';

export class LocalProvider implements FaceSwapProvider {
  readonly name = 'Local (Free)';
  readonly requiresApiKey = false;
  public swapEngine: SharedSwapEngine; // Public for pose detection access
  private enrolledFrame: CapturedFrame | null = null;

  constructor() {
    this.swapEngine = new SharedSwapEngine();
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
    _sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    if (!this.enrolledFrame) {
      throw new Error('No enrolled frame set. Call setEnrolledFrame() first.');
    }
    
    // SharedSwapEngine expects dataUrl strings
    const targetDataUrl = typeof targetImageData === 'string' 
      ? targetImageData 
      : this.imageDataToDataUrl(targetImageData);
    
    console.log('Starting face swap with SharedSwapEngine');
    return await this.swapEngine.swapFaces(this.enrolledFrame, targetDataUrl);
  }


  private imageDataToDataUrl(imageData: ImageData): string {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  getCostEstimate(): string {
    return 'Free - runs in your browser';
  }
}

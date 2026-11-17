/**
 * Mock face swap provider - crude local overlay for testing pipeline
 * No external API calls, just demonstrates the interface
 */

import type { FaceSwapProvider } from '../../types';

export class MockProvider implements FaceSwapProvider {
  readonly name = 'Mock (Local Overlay)';
  readonly requiresApiKey = false;

  isConfigured(): boolean {
    return true;
  }

  async swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    // Convert inputs to images
    const sourceImg = await this.loadImage(sourceFaceData);
    const targetImg = await this.loadImage(targetImageData);
    
    // Create canvas for compositing
    const canvas = document.createElement('canvas');
    canvas.width = targetImg.width;
    canvas.height = targetImg.height;
    const ctx = canvas.getContext('2d')!;
    
    // Draw target image
    ctx.drawImage(targetImg, 0, 0);
    
    // For mock: just overlay source face in upper-left corner with blend
    // Real provider would do landmark-aligned face swap
    const faceSize = Math.min(targetImg.width, targetImg.height) * 0.3;
    const x = targetImg.width * 0.35;
    const y = targetImg.height * 0.15;
    
    // Semi-transparent overlay to show it's working
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sourceImg, x, y, faceSize, faceSize);
    ctx.globalAlpha = 1.0;
    
    // Add debug label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '16px system-ui';
    ctx.fillText('🎭 Mock Swap (Demo Only)', 10, 30);
    
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
        // Convert ImageData to data URL
        const canvas = document.createElement('canvas');
        canvas.width = data.width;
        canvas.height = data.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(data, 0, 0);
        img.src = canvas.toDataURL();
      }
    });
  }
}

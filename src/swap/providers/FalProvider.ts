/**
 * fal.ai face swap provider adapter
 * Uses fal.ai's face swap models
 * 
 * IMPORTANT: This adapter is ready to run but makes NO calls without an API key.
 * The user must provide their fal.ai API key in the settings UI.
 * 
 * Pricing (as of 2024): ~$0.003-0.01 per image
 * See: https://fal.ai/models/fal-ai/face-swap/pricing
 */

import type { FaceSwapProvider } from '../../types';

export class FalProvider implements FaceSwapProvider {
  readonly name = 'fal.ai';
  readonly requiresApiKey = true;
  
  private apiKey: string | null = null;
  
  // Using fal.ai's face swap model
  private readonly modelId = 'fal-ai/face-swap';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  getCostEstimate(): string {
    return '~$0.003-0.01 per swap (see fal.ai/models/fal-ai/face-swap/pricing)';
  }

  async swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('fal.ai API key not configured. Please add your key in settings.');
    }

    // Convert inputs to data URLs if needed
    const sourceUrl = await this.toDataUrl(sourceFaceData);
    const targetUrl = await this.toDataUrl(targetImageData);

    // Upload images to fal.ai storage (required for their API)
    const sourceImageUrl = await this.uploadImage(sourceUrl);
    const targetImageUrl = await this.uploadImage(targetUrl);

    // Submit face swap request
    const result = await this.submitRequest({
      source_image_url: sourceImageUrl,
      target_image_url: targetImageUrl
    });

    // Result should contain the swapped image URL
    const outputUrl = result.image?.url || result.images?.[0]?.url;
    
    if (!outputUrl) {
      throw new Error('No output image in fal.ai response');
    }

    // Download and convert to data URL
    return this.downloadAsDataUrl(outputUrl);
  }

  private async uploadImage(dataUrl: string): Promise<string> {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    
    // Upload to fal.ai storage
    const uploadResponse = await fetch('https://fal.run/fal-ai/face-swap/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.apiKey}`
      },
      body: blob
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      throw new Error(`fal.ai upload failed: ${uploadResponse.status} ${error}`);
    }

    const uploadResult = await uploadResponse.json();
    return uploadResult.url || uploadResult.file_url;
  }

  private async submitRequest(input: Record<string, unknown>): Promise<any> {
    const response = await fetch(`https://fal.run/${this.modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`fal.ai API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  private async toDataUrl(data: string | ImageData): Promise<string> {
    if (typeof data === 'string') {
      return data;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.95);
  }

  private async downloadAsDataUrl(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

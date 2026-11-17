/**
 * Replicate face swap provider adapter
 * Uses Replicate's face swap models (e.g., faceswap or similar)
 * 
 * IMPORTANT: This adapter is ready to run but makes NO calls without an API key.
 * The user must provide their Replicate API token in the settings UI.
 * 
 * Pricing (as of 2024): ~$0.005-0.02 per image depending on model
 * See: https://replicate.com/pricing
 */

import type { FaceSwapProvider } from '../../types';

export class ReplicateProvider implements FaceSwapProvider {
  readonly name = 'Replicate';
  readonly requiresApiKey = true;
  
  private apiKey: string | null = null;
  
  // Using a popular face swap model - user can change this
  // Note: model ID is part of the version lookup, stored here for reference
  // private readonly model = 'yan-ops/face_swap';
  private readonly version = 'latest';

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
    return '~$0.005-0.02 per swap (see replicate.com/pricing)';
  }

  async swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('Replicate API key not configured. Please add your key in settings.');
    }

    // Convert inputs to data URLs if needed
    const sourceUrl = await this.toDataUrl(sourceFaceData);
    const targetUrl = await this.toDataUrl(targetImageData);

    // Create prediction
    const prediction = await this.createPrediction({
      source_image: sourceUrl,
      target_image: targetUrl
    });

    // Poll for completion
    const result = await this.waitForPrediction(prediction.id);
    
    if (result.status === 'failed') {
      throw new Error(`Replicate prediction failed: ${result.error}`);
    }

    // Result is typically an image URL or array of URLs
    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
    
    // Download and convert to data URL for consistent interface
    return this.downloadAsDataUrl(outputUrl);
  }

  private async createPrediction(input: Record<string, unknown>): Promise<any> {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        version: this.version,
        input
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${response.status} ${error}`);
    }

    return response.json();
  }

  private async waitForPrediction(id: string, maxWaitMs = 60000): Promise<any> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: {
          'Authorization': `Token ${this.apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch prediction status: ${response.status}`);
      }

      const prediction = await response.json();
      
      if (prediction.status === 'succeeded' || prediction.status === 'failed') {
        return prediction;
      }

      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Prediction timed out');
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

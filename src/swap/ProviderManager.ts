/**
 * Face swap provider manager
 * Handles provider selection and configuration
 */

import type { FaceSwapProvider, SwapProviderConfig } from '../types';
import { MockProvider } from './providers/MockProvider';
import { ReplicateProvider } from './providers/ReplicateProvider';
import { FalProvider } from './providers/FalProvider';

export class ProviderManager {
  private providers: Map<string, FaceSwapProvider> = new Map();
  private currentProvider: FaceSwapProvider;

  constructor() {
    // Initialize all providers
    this.providers.set('mock', new MockProvider());
    this.providers.set('replicate', new ReplicateProvider());
    this.providers.set('fal', new FalProvider());
    
    // Default to mock
    this.currentProvider = this.providers.get('mock')!;
  }

  /**
   * Get current provider
   */
  getCurrentProvider(): FaceSwapProvider {
    return this.currentProvider;
  }

  /**
   * Get all available providers
   */
  getAllProviders(): Array<{ id: string; provider: FaceSwapProvider }> {
    return Array.from(this.providers.entries()).map(([id, provider]) => ({
      id,
      provider
    }));
  }

  /**
   * Set active provider
   */
  setProvider(config: SwapProviderConfig): void {
    const provider = this.providers.get(config.provider);
    
    if (!provider) {
      throw new Error(`Unknown provider: ${config.provider}`);
    }

    // Configure API key if provided
    if (config.apiKey && 'setApiKey' in provider) {
      (provider as any).setApiKey(config.apiKey);
    }

    this.currentProvider = provider;
  }

  /**
   * Perform face swap with current provider
   */
  async swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string> {
    return this.currentProvider.swapFace(sourceFaceData, targetImageData);
  }

  /**
   * Load saved provider config from localStorage
   */
  loadConfig(): SwapProviderConfig | null {
    const saved = localStorage.getItem('starringyou-swap-config');
    if (!saved) return null;
    
    try {
      return JSON.parse(saved) as SwapProviderConfig;
    } catch {
      return null;
    }
  }

  /**
   * Save provider config to localStorage
   */
  saveConfig(config: SwapProviderConfig): void {
    // Never save API keys - only provider selection
    const configToSave = {
      provider: config.provider
      // apiKey is intentionally omitted
    };
    
    localStorage.setItem('starringyou-swap-config', JSON.stringify(configToSave));
  }
}

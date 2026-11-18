/**
 * Core type definitions for StarringYou
 */

export interface FaceLandmarks {
  landmarks: Array<{ x: number; y: number; z?: number }>;
  blendshapes?: Array<{ categoryName: string; score: number }>;
}

export interface HeadPose {
  yaw: number; // -180 to 180, 0 is straight ahead
  pitch: number; // -90 to 90, 0 is level
  roll: number; // -180 to 180, 0 is upright
}

export interface EnrollmentStep {
  id: string;
  instruction: string;
  targetPose: HeadPose;
  tolerances: { yaw: number; pitch: number; roll: number };
  requireEyesOpen?: boolean;
  requireBlink?: boolean;
  requireDirectionalTurn?: 'left' | 'right'; // Require actual turn in direction
}

export interface FrameQuality {
  sharpness: number; // Laplacian variance
  brightness: number; // Average luminance 0-255
  faceSize: number; // Face bounding box area as fraction of frame
  centering: number; // Distance from center, 0-1 (0 is perfect center)
  eyesOpen: boolean;
  overallScore: number; // Weighted composite 0-100
}

export interface CapturedFrame {
  imageData: ImageData;
  dataUrl: string;
  landmarks: FaceLandmarks;
  pose: HeadPose;
  quality: FrameQuality;
  stepId: string;
  timestamp: number;
  yaw: number; // Store actual yaw for pose-aware swap
  pitch: number; // Store actual pitch for pose-aware swap
}

export interface EnrollmentData {
  frames: CapturedFrame[];
  bestFrontalFrame: CapturedFrame | null;
  completedAt: number;
}

/**
 * Face swap provider interface - pluggable backends
 */
export interface FaceSwapProvider {
  readonly name: string;
  readonly requiresApiKey: boolean;
  
  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;
  
  /**
   * Swap face from source onto target image
   * @param sourceFaceData - Base64 data URL or ImageData of enrolled face
   * @param targetImageData - Base64 data URL or ImageData of clothing model
   * @returns Promise resolving to swapped image as data URL
   */
  swapFace(
    sourceFaceData: string | ImageData,
    targetImageData: string | ImageData
  ): Promise<string>;
  
  /**
   * Get cost estimate per swap (if available)
   */
  getCostEstimate?(): string;
}

export interface SwapProviderConfig {
  provider: 'mock' | 'replicate' | 'fal';
  apiKey?: string;
}

/**
 * Enrollment engine - manages the enrollment flow state and logic
 */

import type { CapturedFrame, EnrollmentData, FaceLandmarks, HeadPose } from '../types';
import { 
  initializeFaceDetection, 
  detectFaces, 
  estimateHeadPose, 
  areEyesOpen, 
  isBlinking,
  isPoseMatched
} from '../utils/faceDetection';
import { evaluateFrameQuality, meetsQualityThreshold } from '../utils/qualityScoring';
import { ENROLLMENT_STEPS, HOLD_DURATION_MS, CAPTURE_INTERVAL_MS, MAX_FRAMES_PER_STEP } from './steps';
import { getTestStream } from '../utils/testMode';

export type EnrollmentState = 'idle' | 'initializing' | 'ready' | 'running' | 'completed' | 'error';

export interface EnrollmentStatus {
  state: EnrollmentState;
  currentStepIndex: number;
  currentStepId: string;
  instruction: string;
  progress: number; // 0-1
  holdProgress: number; // 0-1, progress towards completing current step
  detectedPose: HeadPose | null;
  faceDetected: boolean;
  poseMatched: boolean;
  errorMessage?: string;
}

export class EnrollmentEngine {
  private state: EnrollmentState = 'idle';
  private currentStepIndex = 0;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  
  private allCapturedFrames: CapturedFrame[] = [];
  private holdStartTime: number | null = null;
  private lastCaptureTime = 0;
  private stepFrames: CapturedFrame[] = [];
  
  private statusCallback: ((status: EnrollmentStatus) => void) | null = null;
  private completionCallback: ((data: EnrollmentData) => void) | null = null;

  /**
   * Initialize the enrollment engine
   */
  async initialize(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement
  ): Promise<void> {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    
    this.setState('initializing');
    
    try {
      // Initialize MediaPipe
      await initializeFaceDetection();
      
      // Try test stream first (for development/testing)
      const testStream = await getTestStream();
      
      if (testStream) {
        this.stream = testStream;
      } else {
        // Request camera access with fallback constraints
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            }
          });
        } catch (constraintError: any) {
          // Fallback to simpler constraints if detailed ones fail
          if (constraintError.name === 'OverconstrainedError') {
            console.warn('Falling back to basic video constraints');
            this.stream = await navigator.mediaDevices.getUserMedia({
              video: true
            });
          } else {
            throw constraintError;
          }
        }
      }
      
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      
      this.setState('ready');
    } catch (error) {
      const errorMessage = this.formatError(error);
      console.error('Initialization failed:', error);
      this.setState('error', errorMessage);
      throw error;
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof DOMException) {
      return `${error.name}: ${error.message}`;
    } else if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    } else if (typeof error === 'string') {
      return error;
    } else {
      return String(error);
    }
  }

  /**
   * Start the enrollment flow
   */
  start(): void {
    if (this.state !== 'ready') {
      throw new Error('Engine not ready');
    }
    
    this.currentStepIndex = 0;
    this.allCapturedFrames = [];
    this.holdStartTime = null;
    this.stepFrames = [];
    
    this.setState('running');
    this.processFrame();
  }

  /**
   * Stop and clean up
   */
  stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    this.setState('idle');
  }

  /**
   * Restart enrollment
   */
  restart(): void {
    this.stop();
    if (this.videoElement && this.canvasElement) {
      this.initialize(this.videoElement, this.canvasElement).then(() => {
        this.start();
      });
    }
  }

  /**
   * Register status update callback
   */
  onStatusUpdate(callback: (status: EnrollmentStatus) => void): void {
    this.statusCallback = callback;
  }

  /**
   * Register completion callback
   */
  onComplete(callback: (data: EnrollmentData) => void): void {
    this.completionCallback = callback;
  }

  /**
   * Main frame processing loop
   */
  private processFrame = (): void => {
    if (this.state !== 'running' || !this.videoElement || !this.canvasElement) {
      return;
    }

    const now = performance.now();
    const video = this.videoElement;
    
    try {
      // Detect faces
      const result = detectFaces(video, now);
      
      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        // No face detected
        this.emitStatus(null, false, false);
        this.holdStartTime = null;
        this.animationFrameId = requestAnimationFrame(this.processFrame);
        return;
      }
      
      if (result.faceLandmarks.length > 1) {
        // Multiple faces
        this.emitStatus(null, false, false);
        this.holdStartTime = null;
        this.animationFrameId = requestAnimationFrame(this.processFrame);
        return;
      }
      
      // Extract landmarks and pose
      const landmarks: FaceLandmarks = {
        landmarks: result.faceLandmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        blendshapes: result.faceBlendshapes?.[0]?.categories.map(c => ({
          categoryName: c.categoryName,
          score: c.score
        }))
      };
      
      const pose = estimateHeadPose(landmarks);
      const currentStep = ENROLLMENT_STEPS[this.currentStepIndex];
      
      // Check if pose matches target
      const matched = isPoseMatched(pose, currentStep.targetPose, currentStep.tolerances);
      
      // Check step-specific requirements
      let requirementsMet = matched;
      if (currentStep.requireEyesOpen) {
        requirementsMet = requirementsMet && areEyesOpen(result);
      }
      if (currentStep.requireBlink) {
        requirementsMet = requirementsMet && isBlinking(result);
      }
      
      this.emitStatus(pose, true, matched);
      
      if (requirementsMet) {
        // Start or continue holding
        if (this.holdStartTime === null) {
          this.holdStartTime = now;
        }
        
        const holdDuration = now - this.holdStartTime;
        
        // Capture frames periodically while holding
        if (now - this.lastCaptureTime >= CAPTURE_INTERVAL_MS) {
          this.captureFrame(video, landmarks, pose);
          this.lastCaptureTime = now;
        }
        
        // Check if hold duration met
        if (holdDuration >= HOLD_DURATION_MS) {
          this.advanceStep();
        }
      } else {
        // Pose not matched, reset hold
        this.holdStartTime = null;
      }
      
    } catch (error) {
      console.error('Frame processing error:', error);
    }
    
    this.animationFrameId = requestAnimationFrame(this.processFrame);
  };

  /**
   * Capture a frame with quality evaluation
   */
  private captureFrame(
    video: HTMLVideoElement,
    landmarks: FaceLandmarks,
    pose: HeadPose
  ): void {
    if (!this.canvasElement) return;
    
    const canvas = this.canvasElement;
    const ctx = canvas.getContext('2d')!;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    const eyesOpen = landmarks.blendshapes ? 
      (landmarks.blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0) < 0.3 &&
      (landmarks.blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0) < 0.3 :
      true;
    
    const quality = evaluateFrameQuality(imageData, landmarks, eyesOpen);
    
    if (meetsQualityThreshold(quality)) {
      const frame: CapturedFrame = {
        imageData,
        dataUrl,
        landmarks,
        pose,
        quality,
        stepId: ENROLLMENT_STEPS[this.currentStepIndex].id,
        timestamp: Date.now()
      };
      
      this.stepFrames.push(frame);
      
      // Keep only best frames
      if (this.stepFrames.length > MAX_FRAMES_PER_STEP) {
        this.stepFrames.sort((a, b) => b.quality.overallScore - a.quality.overallScore);
        this.stepFrames = this.stepFrames.slice(0, MAX_FRAMES_PER_STEP);
      }
    }
  }

  /**
   * Advance to next step or complete enrollment
   */
  private advanceStep(): void {
    // Save frames from current step
    this.allCapturedFrames.push(...this.stepFrames);
    this.stepFrames = [];
    this.holdStartTime = null;
    
    // Move to next step
    this.currentStepIndex++;
    
    if (this.currentStepIndex >= ENROLLMENT_STEPS.length) {
      this.completeEnrollment();
    } else {
      this.emitStatus(null, false, false);
    }
  }

  /**
   * Complete enrollment and deliver results
   */
  private completeEnrollment(): void {
    this.setState('completed');
    
    // Find best frontal frame
    const frontalFrames = this.allCapturedFrames.filter(f => f.stepId === 'straight');
    const bestFrontal = frontalFrames.sort((a, b) => 
      b.quality.overallScore - a.quality.overallScore
    )[0] || null;
    
    const enrollmentData: EnrollmentData = {
      frames: this.allCapturedFrames,
      bestFrontalFrame: bestFrontal,
      completedAt: Date.now()
    };
    
    if (this.completionCallback) {
      this.completionCallback(enrollmentData);
    }
    
    this.stop();
  }

  /**
   * Update state and emit status
   */
  private setState(state: EnrollmentState, errorMessage?: string): void {
    this.state = state;
    this.emitStatus(null, false, false, errorMessage);
  }

  /**
   * Emit current status
   */
  private emitStatus(
    detectedPose: HeadPose | null,
    faceDetected: boolean,
    poseMatched: boolean,
    errorMessage?: string
  ): void {
    if (!this.statusCallback) return;
    
    const currentStep = ENROLLMENT_STEPS[this.currentStepIndex] || ENROLLMENT_STEPS[0];
    const progress = this.currentStepIndex / ENROLLMENT_STEPS.length;
    
    let holdProgress = 0;
    if (this.holdStartTime !== null) {
      const holdDuration = performance.now() - this.holdStartTime;
      holdProgress = Math.min(1, holdDuration / HOLD_DURATION_MS);
    }
    
    this.statusCallback({
      state: this.state,
      currentStepIndex: this.currentStepIndex,
      currentStepId: currentStep.id,
      instruction: currentStep.instruction,
      progress,
      holdProgress,
      detectedPose,
      faceDetected,
      poseMatched,
      errorMessage
    });
  }
}

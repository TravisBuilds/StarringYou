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
import { ENROLLMENT_STEPS, HOLD_DURATION_MS, STEP_COMPLETE_DELAY_MS, CAPTURE_INTERVAL_MS, MAX_FRAMES_PER_STEP, MIN_SHARPNESS_THRESHOLD, TARGET_FRAMES_PER_STEP } from './steps';
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
  faceTooFar?: boolean; // Face is turned too far and lost
  stepStartTime?: number; // When this step started
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
  private stepFrameCounts: Map<string, number> = new Map();
  private holdStartTime: number | null = null;
  private lastCaptureTime = 0;
  private stepFrames: CapturedFrame[] = [];
  public stepStartTime: number = 0; // Made public for status callback
  private lastPoseTime: number = 0; // Last time we had a valid pose
  private lastValidPose: HeadPose | null = null;
  private minimumMetTime: number | null = null; // When minimum turn was first achieved
  private bestTurnYaw: number = 0; // Track best turn achieved in current step
  private countdownSeconds = 3;
  private isStepComplete = false;
  private stepCompleteTime: number | null = null;
  
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
    
    this.currentStepIndex = -1; // Start with countdown
    this.countdownSeconds = 3;
    this.allCapturedFrames = [];
    this.stepFrameCounts.clear();
    this.holdStartTime = null;
    this.stepFrames = [];
    this.isStepComplete = false;
    this.stepCompleteTime = null;
    this.stepStartTime = performance.now();
    
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
    
    // Handle countdown intro
    if (this.currentStepIndex === -1) {
      this.handleCountdown(now);
      this.animationFrameId = requestAnimationFrame(this.processFrame);
      return;
    }
    
    // Handle "Got it" transition delay
    if (this.isStepComplete && this.stepCompleteTime) {
      if (now - this.stepCompleteTime >= STEP_COMPLETE_DELAY_MS) {
        this.advanceStep();
      }
      this.animationFrameId = requestAnimationFrame(this.processFrame);
      return;
    }

    const video = this.videoElement;
    
    try {
      // Detect faces
      const result = detectFaces(video, now);
      
      if (!result || !result.faceLandmarks || result.faceLandmarks.length === 0) {
        // No face detected - only reset hold if we've been lost for >500ms
        const timeSincePose = now - this.lastPoseTime;
        const faceTooFar = timeSincePose > 500;
        
        if (faceTooFar) {
          this.holdStartTime = null;
        }
        
        this.emitStatus(this.lastValidPose, false, false, faceTooFar);
        this.animationFrameId = requestAnimationFrame(this.processFrame);
        return;
      }
      
      if (result.faceLandmarks.length > 1) {
        // Multiple faces
        this.emitStatus(null, false, false, false);
        this.holdStartTime = null;
        this.animationFrameId = requestAnimationFrame(this.processFrame);
        return;
      }
      
      this.lastPoseTime = now;
      
      // Extract landmarks and pose
      const landmarks: FaceLandmarks = {
        landmarks: result.faceLandmarks[0].map(lm => ({ x: lm.x, y: lm.y, z: lm.z })),
        blendshapes: result.faceBlendshapes?.[0]?.categories.map(c => ({
          categoryName: c.categoryName,
          score: c.score
        }))
      };
      
      const pose = estimateHeadPose(landmarks);
      this.lastValidPose = pose;
      const currentStep = ENROLLMENT_STEPS[this.currentStepIndex];
      
      // Check if pose matches target with special handling for directional turns
      let matched = false;
      let encourageMore = false;
      
      if (currentStep.requireDirectionalTurn === 'left') {
        // Left turn: yaw must be positive (>= 12°) and pitch roughly level
        matched = pose.yaw >= 12 && Math.abs(pose.pitch) < 20;
        // Track best turn and encourage going further (up to 45°)
        if (matched) {
          this.bestTurnYaw = Math.max(this.bestTurnYaw, pose.yaw);
          if (this.minimumMetTime === null) {
            this.minimumMetTime = now;
          }
          // Encourage more turning if we've met minimum but not reached 45° yet
          encourageMore = pose.yaw < 45 && (now - this.minimumMetTime) < 1500;
        }
      } else if (currentStep.requireDirectionalTurn === 'right') {
        // Right turn: yaw must be negative (<= -12°) and pitch roughly level
        matched = pose.yaw <= -12 && Math.abs(pose.pitch) < 20;
        // Track best turn and encourage going further (up to -45°)
        if (matched) {
          this.bestTurnYaw = Math.min(this.bestTurnYaw, pose.yaw);
          if (this.minimumMetTime === null) {
            this.minimumMetTime = now;
          }
          // Encourage more turning if we've met minimum but not reached -45° yet
          encourageMore = pose.yaw > -45 && (now - this.minimumMetTime) < 1500;
        }
      } else {
        // Standard pose matching
        matched = isPoseMatched(pose, currentStep.targetPose, currentStep.tolerances);
      }
      
      // Check step-specific requirements
      let requirementsMet = matched;
      if (currentStep.requireEyesOpen) {
        requirementsMet = requirementsMet && areEyesOpen(result);
      }
      if (currentStep.requireBlink) {
        requirementsMet = requirementsMet && isBlinking(result);
      }
      
      // Update instruction if encouraging more turn
      if (encourageMore && this.statusCallback) {
        const modifiedStatus = this.getStatus(pose, true, matched, false);
        modifiedStatus.instruction += ' — A bit more…';
        this.statusCallback(modifiedStatus);
      } else {
        this.emitStatus(pose, true, matched, false);
      }
      
      if (requirementsMet) {
        // Start or continue holding
        if (this.holdStartTime === null) {
          this.holdStartTime = now;
        }
        
        const holdDuration = now - this.holdStartTime;
        
        // Capture frames periodically while holding
        if (now - this.lastCaptureTime >= CAPTURE_INTERVAL_MS) {
          const captured = this.captureFrame(video, landmarks, pose);
          this.lastCaptureTime = now;
          
          // Log capture attempt
          if (captured) {
            console.log(`✓ Frame captured for ${currentStep.id}:`, captured.quality.overallScore.toFixed(1), 'quality,', captured.quality.sharpness.toFixed(1), 'sharpness');
          }
        }
        
        // Check if hold duration met
        if (holdDuration >= HOLD_DURATION_MS) {
          // Always capture at least 1 frame before advancing (best available)
          if (this.stepFrames.length === 0) {
            console.warn(`No frames captured for ${currentStep.id}, retrying step...`);
            this.holdStartTime = null; // Retry the step
          } else {
            // Mark step complete
            this.isStepComplete = true;
            this.stepCompleteTime = now;
          }
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
  ): CapturedFrame | null {
    if (!this.canvasElement) {
      console.error('Canvas element missing');
      return null;
    }
    
    const canvas = this.canvasElement;
    const ctx = canvas.getContext('2d')!;
    
    // Ensure canvas is sized
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('Video not ready (0x0), skipping capture');
      return null;
    }
    
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
    
    console.log(`Capture attempt: quality=${quality.overallScore.toFixed(1)}, sharpness=${quality.sharpness.toFixed(1)}, yaw=${pose.yaw.toFixed(1)}, pitch=${pose.pitch.toFixed(1)}`);
    
    const frame: CapturedFrame = {
      imageData,
      dataUrl,
      landmarks,
      pose,
      quality,
      stepId: ENROLLMENT_STEPS[this.currentStepIndex].id,
      timestamp: Date.now(),
      yaw: pose.yaw,
      pitch: pose.pitch
    };
    
    // Always capture frames, but prioritize good quality ones
    const isGoodQuality = meetsQualityThreshold(quality) && quality.sharpness >= MIN_SHARPNESS_THRESHOLD;
    const goodFrameCount = this.stepFrames.filter(f => meetsQualityThreshold(f.quality)).length;
    
    // Accept if: it's good quality OR we have < 1 frame OR it's better than worst frame
    const shouldAccept = isGoodQuality || 
                         this.stepFrames.length === 0 ||
                         (goodFrameCount < TARGET_FRAMES_PER_STEP && quality.overallScore > 40);
    
    if (shouldAccept) {
      this.stepFrames.push(frame);
      
      // Track frames per step
      const stepId = ENROLLMENT_STEPS[this.currentStepIndex].id;
      this.stepFrameCounts.set(stepId, (this.stepFrameCounts.get(stepId) || 0) + 1);
      
      // Keep only best frames (up to MAX_FRAMES_PER_STEP)
      if (this.stepFrames.length > MAX_FRAMES_PER_STEP) {
        this.stepFrames.sort((a, b) => b.quality.overallScore - a.quality.overallScore);
        this.stepFrames = this.stepFrames.slice(0, MAX_FRAMES_PER_STEP);
      }
      
      return frame;
    }
    
    return null;
  }

  /**
   * Handle countdown intro (3-2-1)
   */
  private handleCountdown(now: number): void {
    if (!this.holdStartTime) {
      this.holdStartTime = now;
    }
    
    const elapsed = now - this.holdStartTime;
    const secondsElapsed = Math.floor(elapsed / 1000);
    
    if (secondsElapsed >= this.countdownSeconds) {
      // Countdown complete, move to first step
      this.currentStepIndex = 0;
      this.holdStartTime = null;
      this.isStepComplete = false;
      this.stepCompleteTime = null;
      this.stepStartTime = now;
      return;
    }
    
    const remaining = this.countdownSeconds - secondsElapsed;
    const instruction = remaining > 0 ? `Get ready: ${remaining}` : 'Look straight ahead';
    
    if (this.statusCallback) {
      this.statusCallback({
        state: this.state,
        currentStepIndex: 0,
        currentStepId: 'countdown',
        instruction,
        progress: 0,
        holdProgress: 0,
        detectedPose: null,
        faceDetected: false,
        poseMatched: false
      });
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
    this.minimumMetTime = null;
    this.bestTurnYaw = 0;
    this.isStepComplete = false;
    this.stepCompleteTime = null;
    
    // Move to next step
    this.currentStepIndex++;
    this.stepStartTime = performance.now();
    
    if (this.currentStepIndex >= ENROLLMENT_STEPS.length) {
      this.completeEnrollment();
    } else {
      this.emitStatus(null, false, false, false);
    }
  }
  
  /**
   * Skip current step (for users who get stuck)
   */
  skipStep(): void {
    console.log('Skipping step:', this.currentStepIndex);
    this.advanceStep();
  }

  /**
   * Complete enrollment and deliver results
   */
  private completeEnrollment(): void {
    this.setState('completed');
    
    // Log frame capture summary
    console.log('\n=== Enrollment Complete ===');
    console.log(`Total frames captured: ${this.allCapturedFrames.length}`);
    console.log('Frames per step:');
    ENROLLMENT_STEPS.forEach(step => {
      const count = this.stepFrameCounts.get(step.id) || 0;
      const stepFrames = this.allCapturedFrames.filter(f => f.stepId === step.id);
      const avgQuality = stepFrames.length > 0 
        ? stepFrames.reduce((sum, f) => sum + f.quality.overallScore, 0) / stepFrames.length
        : 0;
      const avgSharpness = stepFrames.length > 0
        ? stepFrames.reduce((sum, f) => sum + f.quality.sharpness, 0) / stepFrames.length
        : 0;
      console.log(`  ${step.id}: ${count} frames (avg quality: ${avgQuality.toFixed(1)}, avg sharpness: ${avgSharpness.toFixed(1)})`);
    });
    
    const usableFrames = this.allCapturedFrames.filter(f => f.quality.overallScore > 50).length;
    console.log(`Usable frames (quality > 50): ${usableFrames}`);
    console.log('=========================\n');
    
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
    // Don't emit status for state changes, errorMessage is handled separately
    if (errorMessage && this.statusCallback) {
      this.statusCallback({
        state: this.state,
        currentStepIndex: this.currentStepIndex,
        currentStepId: ENROLLMENT_STEPS[this.currentStepIndex]?.id || 'unknown',
        instruction: errorMessage,
        progress: 0,
        holdProgress: 0,
        detectedPose: null,
        faceDetected: false,
        poseMatched: false,
        faceTooFar: false,
        stepStartTime: this.stepStartTime,
        errorMessage
      });
    }
  }

  /**
   * Get current status (for emission or modification)
   */
  private getStatus(
    detectedPose: HeadPose | null,
    faceDetected: boolean,
    poseMatched: boolean,
    faceTooFar: boolean
  ): EnrollmentStatus {
    const currentStep = ENROLLMENT_STEPS[this.currentStepIndex] || ENROLLMENT_STEPS[0];
    const progress = this.currentStepIndex / ENROLLMENT_STEPS.length;
    
    let holdProgress = 0;
    if (this.holdStartTime !== null) {
      const holdDuration = performance.now() - this.holdStartTime;
      holdProgress = Math.min(1, holdDuration / HOLD_DURATION_MS);
    }
    
    return {
      state: this.state,
      currentStepIndex: this.currentStepIndex,
      currentStepId: currentStep.id,
      instruction: currentStep.instruction,
      progress,
      holdProgress,
      detectedPose,
      faceDetected,
      poseMatched,
      faceTooFar,
      stepStartTime: this.stepStartTime
    };
  }
  
  /**
   * Emit current status
   */
  private emitStatus(
    detectedPose: HeadPose | null,
    faceDetected: boolean,
    poseMatched: boolean,
    faceTooFar?: boolean
  ): void {
    if (!this.statusCallback) return;
    this.statusCallback(this.getStatus(detectedPose, faceDetected, poseMatched, faceTooFar || false));
  }
}

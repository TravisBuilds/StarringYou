/**
 * StarringYou Extension Onboarding
 * Real enrollment with MediaPipe face detection, pose estimation, and quality scoring
 */

import { EnrollmentEngine } from '../../src/enrollment/EnrollmentEngine';
import { ENROLLMENT_STEPS } from '../../src/enrollment/steps';
import type { CapturedFrame, HeadPose, FaceLandmarks } from '../../src/types';

class OnboardingPage {
  private engine: EnrollmentEngine | null = null;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private instructionElement: HTMLElement;
  private stepIndicators: NodeListOf<Element>;
  private progressRing: SVGCircleElement;
  private startBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private successMsg: HTMLElement;

  constructor() {
    this.videoElement = document.getElementById('video') as HTMLVideoElement;
    this.canvasElement = document.getElementById('canvas') as HTMLCanvasElement;
    this.overlayCanvas = document.getElementById('overlay') as HTMLCanvasElement;
    this.instructionElement = document.getElementById('instruction') as HTMLElement;
    this.stepIndicators = document.querySelectorAll('.step-dot');
    this.progressRing = document.getElementById('progress-ring') as SVGCircleElement;
    this.startBtn = document.getElementById('start-btn') as HTMLButtonElement;
    this.deleteBtn = document.getElementById('delete-btn') as HTMLButtonElement;
    this.successMsg = document.getElementById('success-msg') as HTMLElement;

    this.setupEventListeners();
    this.checkExistingEnrollment();
  }

  private async checkExistingEnrollment() {
    const result = await chrome.storage.local.get('enrollmentData');
    if (result.enrollmentData) {
      this.showEnrolled();
    }
  }

  private setupEventListeners() {
    this.startBtn.addEventListener('click', () => this.startEnrollment());
    this.deleteBtn.addEventListener('click', () => this.deleteData());
  }

  private async startEnrollment() {
    try {
      this.startBtn.style.display = 'none';
      this.deleteBtn.style.display = 'none';
      this.instructionElement.textContent = 'Starting enrollment...';
      
      // Initialize enrollment engine
      this.engine = new EnrollmentEngine();
      this.engine.onStatusUpdate((status) => this.onProgress(status));
      this.engine.onComplete((data) => this.onComplete(data));

      console.log('Initializing enrollment engine...');
      await this.engine.initialize(this.videoElement, this.canvasElement);
      console.log('Starting enrollment...');
      this.engine.start();
      
    } catch (error) {
      console.error('Enrollment error:', error);
      this.instructionElement.textContent = 'Error: ' + (error as Error).message;
      this.startBtn.style.display = 'inline-block';
    }
  }

  private onProgress(status: { 
    state: string;
    currentStepIndex: number; 
    currentStepId: string;
    instruction: string; 
    progress: number;
    holdProgress: number;
    detectedPose: HeadPose | null;
    faceDetected: boolean;
    poseMatched: boolean;
    errorMessage?: string;
    landmarks?: any;
  }) {
    console.log('[Onboarding] onProgress:', status.instruction, `(step ${status.currentStepIndex})`);
    
    // Update instruction
    this.instructionElement.textContent = status.instruction;

    // Update step indicators
    this.stepIndicators.forEach((dot, idx) => {
      dot.classList.remove('active', 'completed');
      if (idx < status.currentStepIndex) {
        dot.classList.add('completed');
      } else if (idx === status.currentStepIndex) {
        dot.classList.add('active');
      }
    });

    // Update progress ring (both overall and hold progress)
    const circumference = 2 * Math.PI * 80;
    const overallProgress = status.progress + (status.holdProgress / ENROLLMENT_STEPS.length);
    const offset = circumference * (1 - overallProgress);
    this.progressRing.style.strokeDasharray = `${circumference}`;
    this.progressRing.style.strokeDashoffset = `${offset}`;

    // Draw landmarks on overlay for visual feedback
    this.drawLandmarksOverlay(status.faceDetected, status.poseMatched);

    // Log pose for debugging
    if (status.detectedPose) {
      console.log(`Step ${status.currentStepIndex}: yaw=${status.detectedPose.yaw.toFixed(1)}° pitch=${status.detectedPose.pitch.toFixed(1)}° roll=${status.detectedPose.roll.toFixed(1)}°, matched=${status.poseMatched}`);
    }
  }

  private drawLandmarksOverlay(faceDetected: boolean, poseMatched: boolean) {
    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx || !this.videoElement.videoWidth) return;

    // Match overlay canvas to video dimensions
    this.overlayCanvas.width = this.videoElement.videoWidth;
    this.overlayCanvas.height = this.videoElement.videoHeight;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);

    // Draw status indicator
    if (faceDetected) {
      ctx.fillStyle = poseMatched ? '#10b981' : '#f59e0b';
      ctx.beginPath();
      ctx.arc(30, 30, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private async onComplete(data: { 
    frames: CapturedFrame[];
    bestFrontalFrame: CapturedFrame;
  }) {
    console.log(`Enrollment complete: ${data.frames.length} frames captured`);
    
    // Get frame dimensions from the captured imageData
    const getFrameDimensions = (frame: CapturedFrame) => ({
      width: frame.imageData.width,
      height: frame.imageData.height
    });
    
    // Save to chrome.storage.local with full frame dimensions
    const enrollmentData = {
      frames: data.frames.map(f => ({
        dataUrl: f.dataUrl,
        timestamp: f.timestamp,
        pose: f.pose,
        quality: f.quality,
        landmarks: f.landmarks,
        width: f.imageData.width,
        height: f.imageData.height
      })),
      bestFrontalFrame: {
        dataUrl: data.bestFrontalFrame.dataUrl,
        timestamp: data.bestFrontalFrame.timestamp,
        pose: data.bestFrontalFrame.pose,
        quality: data.bestFrontalFrame.quality,
        landmarks: data.bestFrontalFrame.landmarks,
        width: data.bestFrontalFrame.imageData.width,
        height: data.bestFrontalFrame.imageData.height
      },
      enrolledAt: Date.now()
    };

    await chrome.storage.local.set({ 
      enrollmentData,
      enabled: true
    });

    this.showEnrolled();
  }

  private showEnrolled() {
    this.successMsg.style.display = 'block';
    this.instructionElement.textContent = 'Enrollment complete!';
    this.progressRing.style.strokeDashoffset = '0';
    this.stepIndicators.forEach(dot => dot.classList.add('completed'));
    this.startBtn.textContent = 'Re-enroll';
    this.startBtn.style.display = 'inline-block';
    this.deleteBtn.style.display = 'inline-block';
  }

  private async deleteData() {
    if (confirm('Delete your enrolled face data? You will need to re-enroll to use face swap.')) {
      await chrome.storage.local.remove('enrollmentData');
      this.successMsg.style.display = 'none';
      this.instructionElement.textContent = 'Click Start to begin enrollment';
      this.stepIndicators.forEach(dot => dot.classList.remove('active', 'completed'));
      this.progressRing.style.strokeDashoffset = '502';
      this.deleteBtn.style.display = 'none';
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new OnboardingPage();
});

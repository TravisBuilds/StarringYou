/**
 * StarringYou Extension Onboarding
 * Real enrollment with MediaPipe face detection, pose estimation, and quality scoring
 */

import { EnrollmentEngine } from '../../src/enrollment/EnrollmentEngine';
import { ENROLLMENT_STEPS } from '../../src/enrollment/steps';
import type { CapturedFrame, HeadPose } from '../../src/types';

class OnboardingPage {
  private engine: EnrollmentEngine | null = null;
  private videoElement: HTMLVideoElement;
  private canvasElement: HTMLCanvasElement;
  private instructionElement: HTMLElement;
  private stepIndicators: NodeListOf<Element>;
  private progressRing: SVGCircleElement;
  private startBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private successMsg: HTMLElement;

  constructor() {
    this.videoElement = document.getElementById('video') as HTMLVideoElement;
    this.canvasElement = document.getElementById('canvas') as HTMLCanvasElement;
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

    // Update progress ring
    const circumference = 2 * Math.PI * 80;
    const offset = circumference * (1 - status.progress);
    this.progressRing.style.strokeDasharray = `${circumference}`;
    this.progressRing.style.strokeDashoffset = `${offset}`;

    // Log pose for debugging
    if (status.detectedPose) {
      console.log(`Step ${status.currentStepIndex}: yaw=${status.detectedPose.yaw.toFixed(1)}° pitch=${status.detectedPose.pitch.toFixed(1)}° roll=${status.detectedPose.roll.toFixed(1)}°, matched=${status.poseMatched}`);
    }
  }

  private async onComplete(data: { 
    frames: CapturedFrame[];
    bestFrontalFrame: CapturedFrame;
  }) {
    console.log(`Enrollment complete: ${data.frames.length} frames captured`);
    
    // Save to chrome.storage.local
    const enrollmentData = {
      frames: data.frames.map(f => ({
        dataUrl: f.dataUrl,
        timestamp: f.timestamp,
        pose: f.pose,
        quality: f.quality,
        landmarks: f.landmarks
      })),
      bestFrontalFrame: {
        dataUrl: data.bestFrontalFrame.dataUrl,
        timestamp: data.bestFrontalFrame.timestamp,
        pose: data.bestFrontalFrame.pose,
        quality: data.bestFrontalFrame.quality
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

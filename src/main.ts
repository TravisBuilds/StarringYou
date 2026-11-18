/**
 * StarringYou - Main Application Entry
 */

import './style.css';
import { EnrollmentEngine } from './enrollment/EnrollmentEngine';
import type { EnrollmentData, CapturedFrame } from './types';
import { saveEnrollment, loadEnrollment, deleteEnrollment, createEnrollmentZip, downloadBlob } from './utils/storage';
import { ProviderManager } from './swap/ProviderManager';
import { isTestModeEnabled, showTestModeIndicator } from './utils/testMode';

// Sample images (real clothing model photos from Unsplash - see CREDITS.txt)
const SAMPLE_IMAGES = [
  { id: 'model-1', path: `${import.meta.env.BASE_URL}sample-images/model-1.jpg`, caption: 'Casual Style' },
  { id: 'model-2', path: `${import.meta.env.BASE_URL}sample-images/model-2.jpg`, caption: 'Business Look' },
  { id: 'model-3', path: `${import.meta.env.BASE_URL}sample-images/model-3.jpg`, caption: 'Portrait Style' },
  { id: 'model-4', path: `${import.meta.env.BASE_URL}sample-images/model-4.jpg`, caption: 'Fashion Forward' }
];

class App {
  private enrollmentEngine: EnrollmentEngine | null = null;
  private enrollmentData: EnrollmentData | null = null;
  private providerManager: ProviderManager;

  constructor() {
    this.providerManager = new ProviderManager();
    this.initializeApp();
  }

  private async initializeApp(): Promise<void> {
    // Set up navigation
    this.setupNavigation();
    
    // Set up enrollment view
    this.setupEnrollmentView();
    
    // Set up swap view
    this.setupSwapView();
    
    // Set up settings view
    this.setupSettingsView();
    
    // Check for existing enrollment
    const existing = await loadEnrollment();
    if (existing) {
      this.enrollmentData = existing;
      this.enableSwapView();
    }
    
    // Create step indicators
    this.createStepIndicators();
  }

  private setupNavigation(): void {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewId = btn.id.replace('nav-', '');
        this.switchView(viewId);
      });
    });
  }

  private async switchView(viewId: string): Promise<void> {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Show selected view
    document.getElementById(`view-${viewId}`)?.classList.add('active');
    document.getElementById(`nav-${viewId}`)?.classList.add('active');
    
    // Refresh enrollment status when switching to swap view
    if (viewId === 'swap') {
      await this.updateEnrollmentStatus();
    }
  }

  private async setupEnrollmentView(): Promise<void> {
    const video = document.getElementById('enrollment-video') as HTMLVideoElement;
    const canvas = document.getElementById('enrollment-canvas') as HTMLCanvasElement;
    const startBtn = document.getElementById('start-enrollment') as HTMLButtonElement;
    const restartBtn = document.getElementById('restart-enrollment') as HTMLButtonElement;
    const instructionText = document.getElementById('instruction-text') as HTMLParagraphElement;

    this.enrollmentEngine = new EnrollmentEngine();

    const initializeCamera = async () => {
      // Check for test mode
      if (isTestModeEnabled()) {
        showTestModeIndicator();
        instructionText.textContent = 'Test mode: initializing with sample image...';
      } else {
        instructionText.textContent = 'Initializing camera...';
      }

      startBtn.style.display = 'none';
      restartBtn.style.display = 'none';

      // Initialize engine (will use test stream if in test mode)
      try {
        await this.enrollmentEngine!.initialize(video, canvas);
        startBtn.style.display = 'inline-block';
        const modeText = isTestModeEnabled() ? ' (Test Mode)' : '';
        instructionText.textContent = `Ready to begin! Click Start to enroll your face.${modeText}`;
      } catch (error: any) {
        console.error('Camera initialization error:', error);
        const errorMessage = this.getErrorMessage(error);
        instructionText.innerHTML = errorMessage + '<br><button id="retry-camera" class="btn btn-secondary" style="margin-top: 1rem;">Retry</button>';
        
        // Add retry button handler
        setTimeout(() => {
          document.getElementById('retry-camera')?.addEventListener('click', () => {
            initializeCamera();
          });
        }, 0);
      }
    };

    await initializeCamera();
    this.setupEnrollmentHandlers(instructionText, startBtn, restartBtn);

  }

  private getErrorMessage(error: any): string {
    const errorName = error?.name || '';
    const errorMsg = error?.message || String(error);
    
    console.log('Error details:', { name: errorName, message: errorMsg, error });

    if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
      return `<strong>Camera permission denied</strong><br>
        On macOS: Go to System Settings → Privacy & Security → Camera → Enable for Chrome<br>
        Then refresh this page.`;
    } else if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
      return `<strong>Camera in use</strong><br>
        The camera is being used by another application. Close other apps using the camera and try again.`;
    } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
      return `<strong>No camera found</strong><br>
        Please connect a webcam and try again.`;
    } else if (errorMsg.includes('MediaPipe') || errorMsg.includes('model') || errorMsg.includes('wasm')) {
      return `<strong>Failed to load face detection models</strong><br>
        ${errorName}: ${errorMsg}<br>
        This may be a temporary network issue. Please try again.`;
    } else {
      return `<strong>Error initializing camera</strong><br>
        ${errorName ? errorName + ': ' : ''}${errorMsg}`;
    }
  }

  private setupEnrollmentHandlers(
    instructionText: HTMLParagraphElement,
    startBtn: HTMLButtonElement,
    restartBtn: HTMLButtonElement
  ): void {
    let skipBtn: HTMLButtonElement | null = null;
    let debugDisplay: HTMLDivElement | null = null;
    
    // Status updates
    this.enrollmentEngine!.onStatusUpdate(status => {
      let instruction = status.instruction;
      
      // Add guidance for face lost
      if (!status.faceDetected && status.faceTooFar) {
        instruction += ' — Not so far, turn back a little';
      } else if (!status.faceDetected && !status.faceTooFar) {
        instruction += ' — Looking for your face...';
      }
      
      instructionText.textContent = instruction;
      
      // Update progress arc
      this.updateProgressArc(status.progress, status.holdProgress);
      
      // Update step indicators
      this.updateStepIndicators(status.currentStepIndex);
      
      // Show/update skip button after 6 seconds on a step
      const timeOnStep = status.stepStartTime ? performance.now() - status.stepStartTime : 0;
      if (timeOnStep > 6000 && !skipBtn) {
        skipBtn = document.createElement('button');
        skipBtn.textContent = 'Skip this step';
        skipBtn.className = 'btn btn-secondary';
        skipBtn.style.marginTop = '0.5rem';
        skipBtn.onclick = () => {
          this.enrollmentEngine?.skipStep();
          skipBtn?.remove();
          skipBtn = null;
        };
        document.querySelector('.instruction-panel')?.appendChild(skipBtn);
      } else if (timeOnStep <= 1000 && skipBtn) {
        skipBtn.remove();
        skipBtn = null;
      }
      
      // Debug display
      if (new URLSearchParams(window.location.search).get('debug') === '1') {
        if (!debugDisplay) {
          debugDisplay = document.createElement('div');
          debugDisplay.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.7);color:#0f0;padding:8px;font-family:monospace;font-size:12px;border-radius:4px;';
          document.querySelector('.camera-wrapper')?.appendChild(debugDisplay);
        }
        if (status.detectedPose) {
          debugDisplay.textContent = `Yaw: ${status.detectedPose.yaw.toFixed(1)}° | Pitch: ${status.detectedPose.pitch.toFixed(1)}° | Matched: ${status.poseMatched}`;
        } else {
          debugDisplay.textContent = 'No face';
        }
      }
    });

    // Completion
    this.enrollmentEngine!.onComplete(async (data) => {
      this.enrollmentData = data;
      try {
        await saveEnrollment(data);
        console.log('Enrollment saved successfully');
      } catch (error) {
        console.error('Failed to save enrollment:', error);
        alert(`Warning: Failed to save enrollment data: ${error}. Data will be lost on page reload.`);
      }
      this.showReviewScreen(data);
      this.enableSwapView();
    });

    // Start button
    startBtn.addEventListener('click', () => {
      this.enrollmentEngine?.start();
      startBtn.style.display = 'none';
      restartBtn.style.display = 'inline-block';
    });

    // Restart button
    restartBtn.addEventListener('click', () => {
      this.enrollmentEngine?.restart();
    });

    // Review screen buttons
    document.getElementById('download-zip')?.addEventListener('click', async () => {
      if (this.enrollmentData) {
        const zip = await createEnrollmentZip(this.enrollmentData.frames);
        downloadBlob(zip, `starringyou-enrollment-${Date.now()}.zip`);
      }
    });

    document.getElementById('retake')?.addEventListener('click', () => {
      this.hideReviewScreen();
      this.enrollmentEngine?.restart();
    });

    document.getElementById('proceed-to-swap')?.addEventListener('click', () => {
      this.switchView('swap');
    });
  }

  private createStepIndicators(): void {
    const container = document.getElementById('step-indicators');
    if (!container) return;

    // 6 steps total
    for (let i = 0; i < 6; i++) {
      const indicator = document.createElement('div');
      indicator.className = 'step-indicator';
      indicator.dataset.step = i.toString();
      container.appendChild(indicator);
    }
  }

  private updateStepIndicators(currentIndex: number): void {
    document.querySelectorAll('.step-indicator').forEach((indicator, idx) => {
      indicator.classList.remove('active', 'completed');
      if (idx < currentIndex) {
        indicator.classList.add('completed');
      } else if (idx === currentIndex) {
        indicator.classList.add('active');
      }
    });
  }

  private updateProgressArc(overall: number, hold: number): void {
    const progressArc = document.getElementById('progress-arc');
    if (!progressArc) return;

    // Calculate arc path for progress ring
    const radius = 80;
    const progress = overall + (hold / 6); // Add hold progress for current step
    const angle = progress * 360;
    
    if (angle > 0) {
      const startAngle = -90;
      const endAngle = startAngle + angle;
      const largeArc = angle > 180 ? 1 : 0;
      
      const startX = 100 + radius * Math.cos((startAngle * Math.PI) / 180);
      const startY = 100 + radius * Math.sin((startAngle * Math.PI) / 180);
      const endX = 100 + radius * Math.cos((endAngle * Math.PI) / 180);
      const endY = 100 + radius * Math.sin((endAngle * Math.PI) / 180);
      
      progressArc.setAttribute('d', 
        `M ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY}`
      );
    } else {
      progressArc.setAttribute('d', '');
    }
  }

  private showReviewScreen(data: EnrollmentData): void {
    const reviewScreen = document.getElementById('review-screen');
    const enrollmentContainer = document.querySelector('.enrollment-container') as HTMLElement;
    const framesContainer = document.getElementById('review-frames');
    
    if (!reviewScreen || !framesContainer) return;

    // Hide enrollment UI
    enrollmentContainer.style.display = 'none';
    reviewScreen.style.display = 'block';

    // Clear previous frames
    framesContainer.innerHTML = '';

    // Show captured frames
    data.frames.forEach(frame => {
      const frameDiv = document.createElement('div');
      frameDiv.className = 'review-frame';
      
      const img = document.createElement('img');
      img.src = frame.dataUrl;
      img.alt = `${frame.stepId} capture`;
      
      const info = document.createElement('div');
      info.className = 'review-frame-info';
      info.innerHTML = `
        <div class="step-label">${frame.stepId}</div>
        <div class="quality-score">Quality: ${frame.quality.overallScore}/100</div>
      `;
      
      frameDiv.appendChild(img);
      frameDiv.appendChild(info);
      framesContainer.appendChild(frameDiv);
    });
  }

  private hideReviewScreen(): void {
    const reviewScreen = document.getElementById('review-screen');
    const enrollmentContainer = document.querySelector('.enrollment-container') as HTMLElement;
    
    if (reviewScreen && enrollmentContainer) {
      reviewScreen.style.display = 'none';
      enrollmentContainer.style.display = 'block';
    }
  }

  private enableSwapView(): void {
    const navSwapBtn = document.getElementById('nav-swap') as HTMLButtonElement;
    if (navSwapBtn) {
      navSwapBtn.disabled = false;
    }
  }

  private async setupSwapView(): Promise<void> {
    const sampleGrid = document.getElementById('sample-image-grid');
    if (!sampleGrid) return;

    // Add enrollment status indicator
    const statusEl = document.createElement('div');
    statusEl.id = 'enrollment-status';
    statusEl.className = 'enrollment-status';
    sampleGrid.parentElement!.insertBefore(statusEl, sampleGrid);
    
    await this.updateEnrollmentStatus();

    // Create sample image cards
    SAMPLE_IMAGES.forEach(sample => {
      const card = document.createElement('div');
      card.className = 'sample-image-card';
      card.innerHTML = `
        <img src="${sample.path}" alt="${sample.caption}" />
        <div class="caption">${sample.caption}</div>
      `;
      
      card.addEventListener('click', () => {
        this.performSwap(sample.path);
      });
      
      sampleGrid.appendChild(card);
    });

    // Add upload option
    const uploadCard = document.createElement('div');
    uploadCard.className = 'sample-image-card upload-card';
    uploadCard.innerHTML = `
      <div class="upload-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
        </svg>
      </div>
      <div class="caption">Upload Your Own</div>
      <input type="file" id="upload-model-image" accept="image/*" style="display:none;">
    `;
    
    const fileInput = uploadCard.querySelector('#upload-model-image') as HTMLInputElement;
    uploadCard.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          this.performSwap(dataUrl);
        };
        reader.readAsDataURL(file);
      }
    });
    
    sampleGrid.appendChild(uploadCard);

    // Try another button
    document.getElementById('try-another')?.addEventListener('click', () => {
      document.getElementById('swap-result')!.style.display = 'none';
    });
  }

  private async updateEnrollmentStatus(): Promise<void> {
    const statusEl = document.getElementById('enrollment-status');
    if (!statusEl) return;
    
    // Check enrollment data
    if (!this.enrollmentData) {
      this.enrollmentData = await loadEnrollment();
    }
    
    if (!this.enrollmentData) {
      statusEl.className = 'enrollment-status error';
      statusEl.innerHTML = '⚠️ No enrollment found. Please complete enrollment first.';
    } else if (!this.enrollmentData.frames || this.enrollmentData.frames.length === 0) {
      statusEl.className = 'enrollment-status error';
      statusEl.innerHTML = '⚠️ Enrollment incomplete: no frames captured.';
    } else {
      // Check for frames with valid data (dataUrl at minimum)
      const validFrames = this.enrollmentData.frames.filter(f => f.dataUrl && f.dataUrl.length > 0);
      if (validFrames.length === 0) {
        statusEl.className = 'enrollment-status error';
        statusEl.innerHTML = `⚠️ No valid frames found. Please re-enroll.`;
      } else {
        const usableFrames = validFrames.filter(f => f.quality.overallScore > 50).length;
        statusEl.className = 'enrollment-status success';
        statusEl.innerHTML = `✅ Enrolled (${validFrames.length} frame${validFrames.length !== 1 ? 's' : ''}, ${usableFrames} high quality)`;
      }
    }
  }

  private async performSwap(targetImagePath: string): Promise<void> {
    // Check enrollment data, reload from storage if needed
    if (!this.enrollmentData) {
      console.log('No enrollment data in memory, checking storage...');
      this.enrollmentData = await loadEnrollment();
    }
    
    if (!this.enrollmentData) {
      await this.updateEnrollmentStatus();
      return;
    }
    
    if (!this.enrollmentData.frames || this.enrollmentData.frames.length === 0) {
      await this.updateEnrollmentStatus();
      return;
    }
    
    const usableFrames = this.enrollmentData.frames.filter(f => f.quality.overallScore > 50);
    if (usableFrames.length === 0) {
      await this.updateEnrollmentStatus();
      return;
    }

    const loadingEl = document.getElementById('swap-loading')!;
    const resultEl = document.getElementById('swap-result')!;
    
    loadingEl.style.display = 'block';
    resultEl.style.display = 'none';

    try {
      // Detect target face pose for best frame selection
      let targetYaw = 0, targetPitch = 0;
      try {
        const targetPose = await this.detectTargetFacePose(targetImagePath);
        if (targetPose) {
          targetYaw = targetPose.yaw;
          targetPitch = targetPose.pitch;
          console.log('Target face pose:', targetPose);
        }
      } catch (error) {
        console.warn('Could not detect target face pose, using frontal:', error);
      }
      
      // Select best frame based on target pose
      const bestFrame = this.selectBestSourceFrame(this.enrollmentData, targetYaw, targetPitch);
      
      if (!bestFrame) {
        throw new Error('No suitable frame found for swap');
      }
      
      // Set enrolled frame on Local provider if that's what we're using
      const currentProvider = this.providerManager.getCurrentProvider();
      if ('setEnrolledFrame' in currentProvider) {
        (currentProvider as any).setEnrolledFrame(bestFrame);
        console.log('Set enrolled frame:', {
          hasImageData: !!bestFrame.imageData,
          hasLandmarks: !!bestFrame.landmarks,
          pose: bestFrame.pose
        });
      }
      
      const swappedImage = await this.providerManager.swapFace(bestFrame.dataUrl, targetImagePath);

      // Display results
      (document.getElementById('enrolled-face-img') as HTMLImageElement).src = bestFrame.dataUrl;
      (document.getElementById('target-model-img') as HTMLImageElement).src = targetImagePath;
      (document.getElementById('swapped-result-img') as HTMLImageElement).src = swappedImage;
      
      const costInfo = currentProvider.getCostEstimate?.() || '';
      document.getElementById('swap-provider-info')!.textContent = 
        `Provider: ${currentProvider.name}${costInfo ? ' • ' + costInfo : ''}`;

      loadingEl.style.display = 'none';
      resultEl.style.display = 'block';
    } catch (error: any) {
      loadingEl.style.display = 'none';
      
      // Show error message
      const errorMsg = error.message || 'Unknown error';
      console.error('Swap error:', error);
      
      // Display error in UI instead of alert
      resultEl.innerHTML = `
        <div style="padding: 20px; text-align: center;">
          <h3 style="color: #d32f2f;">Face Swap Failed</h3>
          <p>${errorMsg}</p>
          <p style="font-size: 0.9em; color: #666;">Check the console for details.</p>
        </div>
      `;
      resultEl.style.display = 'block';
    }
  }

  /**
   * Select the best source frame based on target pose
   * @param data Enrollment data with all captured frames
   * @param targetYaw Target face yaw (0 for frontal)
   * @param targetPitch Target face pitch (0 for level)
   * @returns Data URL of the best matching frame
   */
  /**
   * Detect target face pose (simplified - just return null for now)
   * SharedSwapEngine doesn't expose face detection separately
   */
  private async detectTargetFacePose(_imageUrl: string): Promise<{ yaw: number; pitch: number; roll: number } | null> {
    // Pose-aware matching is handled inside SharedSwapEngine's cache
    return null;
  }

  private selectBestSourceFrame(
    data: EnrollmentData,
    targetYaw: number,
    targetPitch: number
  ): CapturedFrame | null {
    if (!data.frames || data.frames.length === 0) {
      return data.bestFrontalFrame || null;
    }

    // Find frame with closest pose match
    let bestFrame = data.bestFrontalFrame;
    let bestDistance = Infinity;

    for (const frame of data.frames) {
      // Calculate pose distance (weighted by yaw more than pitch)
      const yawDist = Math.abs(frame.yaw - targetYaw);
      const pitchDist = Math.abs(frame.pitch - targetPitch);
      const distance = yawDist * 2 + pitchDist; // Weight yaw more heavily
      
      if (distance < bestDistance && frame.quality.overallScore > 50) {
        bestDistance = distance;
        bestFrame = frame;
      }
    }

    const result = bestFrame || data.bestFrontalFrame || null;
    if (result) {
      console.log(`Selected frame: yaw=${result.yaw.toFixed(1)}, pitch=${result.pitch.toFixed(1)}, quality=${result.quality.overallScore.toFixed(1)}`);
    }
    return result;
  }

  private setupSettingsView(): void {
    const providerRadios = document.querySelectorAll('input[name="provider"]');
    const apiKeySection = document.getElementById('api-key-section')!;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;

    // Load saved config
    const savedConfig = this.providerManager.loadConfig();
    if (savedConfig) {
      const radio = document.querySelector(`input[value="${savedConfig.provider}"]`) as HTMLInputElement;
      if (radio) radio.checked = true;
    }

    // Provider selection
    providerRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const value = (e.target as HTMLInputElement).value;
        
        // Show/hide API key section
        if (value === 'mock') {
          apiKeySection.style.display = 'none';
          apiKeyInput.value = '';
        } else {
          apiKeySection.style.display = 'block';
        }

        // Update provider (without key initially)
        this.providerManager.setProvider({ provider: value as any });
        this.providerManager.saveConfig({ provider: value as any });
      });
    });

    // API key input
    apiKeyInput.addEventListener('input', (e) => {
      const key = (e.target as HTMLInputElement).value;
      const selectedProvider = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
      
      if (selectedProvider) {
        this.providerManager.setProvider({
          provider: selectedProvider.value as any,
          apiKey: key
        });
      }
    });

    // Delete data button
    document.getElementById('delete-data')?.addEventListener('click', async () => {
      if (confirm('Are you sure you want to delete all your face data? This cannot be undone.')) {
        await deleteEnrollment();
        this.enrollmentData = null;
        
        const navSwapBtn = document.getElementById('nav-swap') as HTMLButtonElement;
        if (navSwapBtn) {
          navSwapBtn.disabled = true;
        }
        
        alert('Face data deleted successfully.');
        this.switchView('enroll');
      }
    });

    // Trigger initial state
    const selectedRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
    if (selectedRadio && selectedRadio.value !== 'mock') {
      apiKeySection.style.display = 'block';
    }
  }
}

// Initialize app
new App();

/**
 * StarringYou - Main Application Entry
 */

import './style.css';
import { EnrollmentEngine } from './enrollment/EnrollmentEngine';
import type { EnrollmentData } from './types';
import { saveEnrollment, loadEnrollment, deleteEnrollment, createEnrollmentZip, downloadBlob } from './utils/storage';
import { ProviderManager } from './swap/ProviderManager';
import { isTestModeEnabled, showTestModeIndicator } from './utils/testMode';

// Sample images (real clothing model photos from Unsplash - see CREDITS.txt)
const SAMPLE_IMAGES = [
  { id: 'model-1', path: '/sample-images/model-1.jpg', caption: 'Casual Style' },
  { id: 'model-2', path: '/sample-images/model-2.jpg', caption: 'Business Look' },
  { id: 'model-3', path: '/sample-images/model-3.jpg', caption: 'Portrait Style' },
  { id: 'model-4', path: '/sample-images/model-4.jpg', caption: 'Fashion Forward' }
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

  private switchView(viewId: string): void {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    // Show selected view
    document.getElementById(`view-${viewId}`)?.classList.add('active');
    document.getElementById(`nav-${viewId}`)?.classList.add('active');
  }

  private async setupEnrollmentView(): Promise<void> {
    const video = document.getElementById('enrollment-video') as HTMLVideoElement;
    const canvas = document.getElementById('enrollment-canvas') as HTMLCanvasElement;
    const startBtn = document.getElementById('start-enrollment') as HTMLButtonElement;
    const restartBtn = document.getElementById('restart-enrollment') as HTMLButtonElement;
    const instructionText = document.getElementById('instruction-text') as HTMLParagraphElement;

    this.enrollmentEngine = new EnrollmentEngine();

    // Check for test mode
    if (isTestModeEnabled()) {
      showTestModeIndicator();
      instructionText.textContent = 'Test mode: initializing with sample image...';
    }

    // Initialize engine (will use test stream if in test mode)
    try {
      await this.enrollmentEngine.initialize(video, canvas);
      startBtn.style.display = 'inline-block';
      const modeText = isTestModeEnabled() ? ' (Test Mode)' : '';
      instructionText.textContent = `Ready to begin! Click Start to enroll your face.${modeText}`;
    } catch (error: any) {
      instructionText.textContent = `Error: ${error.message}. Please allow camera access.`;
    }

    // Status updates
    this.enrollmentEngine.onStatusUpdate(status => {
      instructionText.textContent = status.instruction;
      
      // Update progress arc
      this.updateProgressArc(status.progress, status.holdProgress);
      
      // Update step indicators
      this.updateStepIndicators(status.currentStepIndex);
    });

    // Completion
    this.enrollmentEngine.onComplete(async (data) => {
      this.enrollmentData = data;
      await saveEnrollment(data);
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

  private setupSwapView(): void {
    const sampleGrid = document.getElementById('sample-image-grid');
    if (!sampleGrid) return;

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

    // Try another button
    document.getElementById('try-another')?.addEventListener('click', () => {
      document.getElementById('swap-result')!.style.display = 'none';
    });
  }

  private async performSwap(targetImagePath: string): Promise<void> {
    if (!this.enrollmentData?.bestFrontalFrame) {
      alert('Please complete enrollment first!');
      return;
    }

    const loadingEl = document.getElementById('swap-loading')!;
    const resultEl = document.getElementById('swap-result')!;
    
    loadingEl.style.display = 'block';
    resultEl.style.display = 'none';

    try {
      // Perform swap
      const sourceFace = this.enrollmentData.bestFrontalFrame.dataUrl;
      const swappedImage = await this.providerManager.swapFace(sourceFace, targetImagePath);

      // Display results
      (document.getElementById('enrolled-face-img') as HTMLImageElement).src = sourceFace;
      (document.getElementById('target-model-img') as HTMLImageElement).src = targetImagePath;
      (document.getElementById('swapped-result-img') as HTMLImageElement).src = swappedImage;
      
      const provider = this.providerManager.getCurrentProvider();
      const costInfo = provider.getCostEstimate?.() || '';
      document.getElementById('swap-provider-info')!.textContent = 
        `Provider: ${provider.name}${costInfo ? ' • ' + costInfo : ''}`;

      loadingEl.style.display = 'none';
      resultEl.style.display = 'block';
    } catch (error: any) {
      loadingEl.style.display = 'none';
      alert(`Swap failed: ${error.message}`);
    }
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

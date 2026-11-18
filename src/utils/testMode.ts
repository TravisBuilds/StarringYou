/**
 * Test mode utilities for development without webcam
 * Allows testing enrollment flow with static images or video files
 */

/**
 * Check if test mode is enabled via URL parameter
 */
export function isTestModeEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('testMode') === 'true';
}

/**
 * Get test image source from URL parameter
 */
export function getTestImageSource(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('testImage');
}

/**
 * Create a fake video stream from a static image
 * Useful for testing face detection without webcam
 */
export async function createImageVideoStream(imageSrc: string): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Create canvas to render the image
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      
      // Draw image repeatedly to simulate video
      const drawFrame = () => {
        ctx.drawImage(img, 0, 0);
        requestAnimationFrame(drawFrame);
      };
      drawFrame();
      
      // Create MediaStream from canvas
      const stream = canvas.captureStream(30); // 30 FPS
      resolve(stream);
    };
    
    img.onerror = () => reject(new Error(`Failed to load test image: ${imageSrc}`));
    img.src = imageSrc;
  });
}

/**
 * Create a fake video stream from a video file
 */
export async function createVideoFileStream(videoSrc: string): Promise<MediaStream> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    
    video.onloadeddata = async () => {
      try {
        await video.play();
        
        // Create canvas to capture video frames
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d')!;
        
        // Copy video frames to canvas
        const drawFrame = () => {
          if (!video.paused && !video.ended) {
            ctx.drawImage(video, 0, 0);
            requestAnimationFrame(drawFrame);
          }
        };
        drawFrame();
        
        const stream = canvas.captureStream(30);
        resolve(stream);
      } catch (error) {
        reject(error);
      }
    };
    
    video.onerror = () => reject(new Error(`Failed to load test video: ${videoSrc}`));
    video.src = videoSrc;
  });
}

/**
 * Get appropriate test stream based on URL parameters
 */
export async function getTestStream(): Promise<MediaStream | null> {
  if (!isTestModeEnabled()) {
    return null;
  }
  
  const testImage = getTestImageSource();
  
  if (testImage) {
    try {
      return await createImageVideoStream(testImage);
    } catch (error) {
      console.error('Failed to create test stream:', error);
      return null;
    }
  }
  
  // Default test image from samples
  try {
    return await createImageVideoStream(`${import.meta.env.BASE_URL}sample-images/model-2.jpg`);
  } catch (error) {
    console.error('Failed to create default test stream:', error);
    return null;
  }
}

/**
 * Show test mode indicator in UI
 */
export function showTestModeIndicator(): void {
  const indicator = document.createElement('div');
  indicator.id = 'test-mode-indicator';
  indicator.innerHTML = '🧪 Test Mode (using still image)';
  indicator.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    background: #f59e0b;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10000;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(indicator);
}

/**
 * StarringYou - Content Script
 * Detects and swaps faces on product images
 */

console.log('⭐ StarringYou content script loaded');

// E2E Testing: Hardcoded test face (will be overridden by real enrollment)
const TEST_MODE = window.location.search.includes('test=true');
const HARDCODED_TEST_FACE = 'http://localhost:8765/public/sample-images/model-2.jpg';

console.log('⭐ TEST_MODE:', TEST_MODE);

// Extension state
let extensionEnabled = false;
let enrollmentData = null;
let autoSwapMode = true;
let swapCache = new Map();

// Initialize
async function init() {
  // Get initial state
  const result = await chrome.storage.local.get(['enabled', 'enrollmentData', 'swapCache']);
  extensionEnabled = result.enabled || false;
  enrollmentData = result.enrollmentData || null;
  
  // E2E Test mode: use hardcoded test face
  if (TEST_MODE && !enrollmentData) {
    console.log('StarringYou: TEST MODE - using hardcoded test face');
    extensionEnabled = true;
    enrollmentData = {
      frontalFrame: HARDCODED_TEST_FACE,
      enrolledAt: Date.now()
    };
  }
  
  // Load cache from storage
  if (result.swapCache) {
    swapCache = new Map(Object.entries(result.swapCache));
  }

  if (extensionEnabled && enrollmentData) {
    console.log('StarringYou: Extension active, scanning for product images');
    scanForProductImages();
  }
}

// Listen for state changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.enabled) {
      extensionEnabled = changes.enabled.newValue;
      if (extensionEnabled && enrollmentData) {
        scanForProductImages();
      } else {
        removeAllSwaps();
      }
    }
    if (changes.enrollmentData) {
      enrollmentData = changes.enrollmentData.newValue;
      // Clear cache when enrollment changes
      swapCache.clear();
      chrome.storage.local.set({ swapCache: {} });
    }
  }
});

// Scan page for product images
function scanForProductImages() {
  // Find all images on the page
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    // Skip if already processed
    if (img.hasAttribute('data-starringyou-processed')) {
      return;
    }

    // Check if image is large enough (likely a product image)
    if (img.naturalWidth >= 200 && img.naturalHeight >= 200) {
      processImage(img);
    } else {
      // Wait for image to load
      img.addEventListener('load', () => {
        if (img.naturalWidth >= 200 && img.naturalHeight >= 200) {
          processImage(img);
        }
      }, { once: true });
    }
  });

  // Observe DOM for new images (lazy loading)
  observeNewImages();
}

// Process a single image
async function processImage(img) {
  img.setAttribute('data-starringyou-processed', 'true');
  
  // Create wrapper for hover button
  const wrapper = createImageWrapper(img);
  
  // Add hover button for manual swap
  const starBtn = createStarButton();
  wrapper.appendChild(starBtn);
  
  starBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await swapImageFace(img);
  });

  // Auto-swap if enabled
  if (autoSwapMode) {
    // Check if image likely contains a face (simple heuristic: portrait orientation)
    const aspectRatio = img.naturalWidth / img.naturalHeight;
    if (aspectRatio > 0.5 && aspectRatio < 2.0) {
      await swapImageFace(img);
    }
  }
}

// Create wrapper around image for positioning buttons
function createImageWrapper(img) {
  // Check if already wrapped
  if (img.parentElement?.classList.contains('starringyou-wrapper')) {
    return img.parentElement;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'starringyou-wrapper';
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.maxWidth = '100%';
  
  img.parentNode.insertBefore(wrapper, img);
  wrapper.appendChild(img);
  
  return wrapper;
}

// Create "Star me" button
function createStarButton() {
  const btn = document.createElement('button');
  btn.className = 'starringyou-star-btn';
  btn.innerHTML = '⭐ Star me';
  btn.title = 'Swap face with StarringYou';
  return btn;
}

// Create toggle badge
function createToggleBadge(img, originalSrc) {
  const badge = document.createElement('button');
  badge.className = 'starringyou-toggle-badge';
  badge.innerHTML = '🔄';
  badge.title = 'Toggle original / swapped';
  
  let showingSwapped = true;
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    showingSwapped = !showingSwapped;
    if (showingSwapped) {
      const swappedSrc = img.getAttribute('data-starringyou-swapped');
      if (swappedSrc) {
        img.src = swappedSrc;
      }
      badge.style.background = '#10b981';
    } else {
      img.src = originalSrc;
      badge.style.background = '#6366f1';
    }
  });
  
  return badge;
}

// Perform face swap on image
async function swapImageFace(img) {
  const originalSrc = img.src;
  
  // Check cache first
  const cacheKey = await hashImageUrl(originalSrc);
  if (swapCache.has(cacheKey)) {
    console.log('StarringYou: Using cached swap');
    applySwappedImage(img, swapCache.get(cacheKey));
    return;
  }

  // Show loading indicator
  const wrapper = img.parentElement;
  const loader = document.createElement('div');
  loader.className = 'starringyou-loader';
  loader.innerHTML = '⭐ Swapping...';
  wrapper.appendChild(loader);

  try {
    // Fetch image (via background to avoid CORS)
    const imageData = await fetchImageViaBackground(originalSrc);
    
    // Perform simple swap (overlay for now)
    const swappedDataUrl = await performSimpleSwap(
      enrollmentData.frontalFrame,
      imageData
    );

    // Skip if no face detected
    if (!swappedDataUrl) {
      console.log('StarringYou: Skipping image (no face)');
      return;
    }

    // Cache result
    swapCache.set(cacheKey, swappedDataUrl);
    await saveSwapCache();

    // Apply swapped image
    applySwappedImage(img, swappedDataUrl);
    
  } catch (error) {
    console.error('StarringYou: Swap failed:', error);
  } finally {
    loader.remove();
  }
}

// Fetch image via background script to avoid CORS
async function fetchImageViaBackground(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'fetchImage', url },
      (response) => {
        if (response && response.success) {
          resolve(response.dataUrl);
        } else {
          reject(new Error(response?.error || 'Failed to fetch image'));
        }
      }
    );
  });
}

// Detect face in target image via background/offscreen
async function detectFaceInImage(imageUrl) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'detectFaceInImage', imageUrl },
      (response) => {
        if (response && response.success) {
          resolve(response);
        } else {
          reject(new Error(response?.error || 'Face detection failed'));
        }
      }
    );
  });
}

// Perform face swap with real face detection
async function performSimpleSwap(sourceFaceDataUrl, targetImageDataUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      // Detect face in target image
      console.log('StarringYou: Detecting face in target image...');
      const targetFaceData = await detectFaceInImage(targetImageDataUrl);
      
      if (!targetFaceData.success) {
        console.log('StarringYou: No face detected, skipping swap');
        resolve(null); // Return null to skip this image
        return;
      }
      
      console.log('StarringYou: Face detected, swapping...');
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const sourceImg = new Image();
      const targetImg = new Image();

      let sourceLoaded = false;
      let targetLoaded = false;

      sourceImg.onload = () => {
        sourceLoaded = true;
        if (targetLoaded) draw();
      };

      targetImg.onload = () => {
        targetLoaded = true;
        if (sourceLoaded) draw();
      };

      function draw() {
        canvas.width = targetImg.width;
        canvas.height = targetImg.height;

        // Draw target image
        ctx.drawImage(targetImg, 0, 0);

        // Get target face landmarks (in normalized coordinates)
        const { keyPoints } = targetFaceData;
        
        // Convert normalized coordinates to pixels
        const leftEye = {
          x: keyPoints.leftEye.x * targetImg.width,
          y: keyPoints.leftEye.y * targetImg.height
        };
        const rightEye = {
          x: keyPoints.rightEye.x * targetImg.width,
          y: keyPoints.rightEye.y * targetImg.height
        };
        
        // Calculate face center, size, and rotation
        const eyesCenterX = (leftEye.x + rightEye.x) / 2;
        const eyesCenterY = (leftEye.y + rightEye.y) / 2;
        const eyeDistance = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) + 
          Math.pow(rightEye.y - leftEye.y, 2)
        );
        const faceWidth = eyeDistance * 2.5;
        const faceHeight = faceWidth * 1.3;
        const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
        
        // Create elliptical feathered mask
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = Math.ceil(faceWidth * 2);
        maskCanvas.height = Math.ceil(faceHeight * 2);
        const maskCtx = maskCanvas.getContext('2d');
        
        const centerX = maskCanvas.width / 2;
        const centerY = maskCanvas.height / 2;
        const radiusX = faceWidth / 2;
        const radiusY = faceHeight / 2;
        
        // Create radial gradient for feathering
        const gradient = maskCtx.createRadialGradient(
          centerX, centerY, Math.min(radiusX, radiusY) * 0.6,
          centerX, centerY, Math.max(radiusX, radiusY)
        );
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.8, 'rgba(255,255,255,1)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        
        maskCtx.fillStyle = gradient;
        maskCtx.beginPath();
        maskCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
        maskCtx.fill();
        
        // Apply transformation and draw source face
        ctx.save();
        ctx.translate(eyesCenterX, eyesCenterY);
        ctx.rotate(angle);
        
        // Draw source face scaled to match target face size
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(sourceImg, 
          -faceWidth / 2, 
          -faceHeight / 2, 
          faceWidth, 
          faceHeight
        );
        
        // Apply mask for smooth blending
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(maskCanvas, 
          -maskCanvas.width / 2, 
          -maskCanvas.height / 2
        );
        
        ctx.restore();

        resolve(canvas.toDataURL('image/jpeg', 0.92));
      }

      sourceImg.src = sourceFaceDataUrl;
      targetImg.src = targetImageDataUrl;
    } catch (error) {
      console.error('StarringYou: Face swap error:', error);
      reject(error);
    }
  });
}

// Apply swapped image to DOM
function applySwappedImage(img, swappedDataUrl) {
  const originalSrc = img.src;
  
  // Store original
  img.setAttribute('data-starringyou-original', originalSrc);
  img.setAttribute('data-starringyou-swapped', swappedDataUrl);
  
  // Replace with swapped
  img.src = swappedDataUrl;
  
  // Add toggle badge
  const wrapper = img.parentElement;
  if (wrapper?.classList.contains('starringyou-wrapper')) {
    const badge = createToggleBadge(img, originalSrc);
    wrapper.appendChild(badge);
  }
}

// Hash image URL for caching
async function hashImageUrl(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// Save cache to storage
async function saveSwapCache() {
  const cacheObj = Object.fromEntries(swapCache);
  await chrome.storage.local.set({ swapCache: cacheObj });
}

// Remove all swaps
function removeAllSwaps() {
  document.querySelectorAll('[data-starringyou-original]').forEach(img => {
    const original = img.getAttribute('data-starringyou-original');
    if (original) {
      img.src = original;
    }
  });
  
  document.querySelectorAll('.starringyou-toggle-badge, .starringyou-star-btn').forEach(el => {
    el.remove();
  });
}

// Observe new images (lazy loading)
function observeNewImages() {
  const observer = new MutationObserver((mutations) => {
    if (!extensionEnabled || !enrollmentData) return;

    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeName === 'IMG') {
          if (node.naturalWidth >= 200 && node.naturalHeight >= 200) {
            processImage(node);
          }
        } else if (node.querySelectorAll) {
          const images = node.querySelectorAll('img');
          images.forEach(img => {
            if (img.naturalWidth >= 200 && img.naturalHeight >= 200) {
              processImage(img);
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

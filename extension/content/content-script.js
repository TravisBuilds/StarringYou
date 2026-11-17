/**
 * StarringYou - Content Script
 * Detects and swaps faces on product images
 */

console.log('⭐ StarringYou content script loaded');

// E2E Testing: Hardcoded test face (will be overridden by real enrollment)
const TEST_MODE = window.location.search.includes('test=true');
const HARDCODED_TEST_FACE = 'http://localhost:8765/public/sample-images/model-2.jpg';
const DEBUG_MODE = window.location.search.includes('debug=true');

console.log('⭐ TEST_MODE:', TEST_MODE);
console.log('⭐ DEBUG_MODE:', DEBUG_MODE);

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

// Get face oval landmark indices (MediaPipe 478-point mesh)
const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
];

// Perform face swap with proper landmark-based alignment
async function performSimpleSwap(sourceFaceDataUrl, targetImageDataUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      // Detect faces in both source and target
      console.log('StarringYou: Detecting faces...');
      const [sourceFaceData, targetFaceData] = await Promise.all([
        detectFaceInImage(sourceFaceDataUrl),
        detectFaceInImage(targetImageDataUrl)
      ]);
      
      if (!targetFaceData.success) {
        console.log('StarringYou: No face in target, skipping');
        resolve(null);
        return;
      }
      
      if (!sourceFaceData.success) {
        console.log('StarringYou: No face in source, using fallback');
        resolve(null);
        return;
      }
      
      console.log('StarringYou: Both faces detected, aligning...');
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const sourceImg = new Image();
      const targetImg = new Image();
      
      await Promise.all([
        new Promise(r => { sourceImg.onload = r; sourceImg.src = sourceFaceDataUrl; }),
        new Promise(r => { targetImg.onload = r; targetImg.src = targetImageDataUrl; })
      ]);
      
      // Set canvas to target image size
      canvas.width = targetImg.naturalWidth;
      canvas.height = targetImg.naturalHeight;
      
      // Draw target image first
      ctx.drawImage(targetImg, 0, 0, canvas.width, canvas.height);
      
      // Get landmarks in pixel coordinates
      const srcLandmarks = sourceFaceData.landmarks.map(p => ({
        x: p.x * sourceImg.naturalWidth,
        y: p.y * sourceImg.naturalHeight
      }));
      
      const tgtLandmarks = targetFaceData.landmarks.map(p => ({
        x: p.x * canvas.width,
        y: p.y * canvas.height
      }));
      
      // Extract key points for alignment
      const srcLeftEye = srcLandmarks[33];
      const srcRightEye = srcLandmarks[263];
      const srcMouth = srcLandmarks[13];
      const tgtLeftEye = tgtLandmarks[33];
      const tgtRightEye = tgtLandmarks[263];
      const tgtMouth = tgtLandmarks[13];
      
      // Compute similarity transform (scale, rotate, translate)
      const srcEyeCenter = { 
        x: (srcLeftEye.x + srcRightEye.x) / 2,
        y: (srcLeftEye.y + srcRightEye.y) / 2
      };
      const tgtEyeCenter = {
        x: (tgtLeftEye.x + tgtRightEye.x) / 2,
        y: (tgtLeftEye.y + tgtRightEye.y) / 2
      };
      
      const srcEyeDist = Math.hypot(srcRightEye.x - srcLeftEye.x, srcRightEye.y - srcLeftEye.y);
      const tgtEyeDist = Math.hypot(tgtRightEye.x - tgtLeftEye.x, tgtRightEye.y - tgtLeftEye.y);
      const scale = tgtEyeDist / srcEyeDist;
      
      const srcAngle = Math.atan2(srcRightEye.y - srcLeftEye.y, srcRightEye.x - srcLeftEye.x);
      const tgtAngle = Math.atan2(tgtRightEye.y - tgtLeftEye.y, tgtRightEye.x - tgtLeftEye.x);
      const rotation = tgtAngle - srcAngle;
      
      // Crop source face region
      const srcFaceOval = FACE_OVAL_INDICES.map(i => srcLandmarks[i]);
      const srcMinX = Math.min(...srcFaceOval.map(p => p.x));
      const srcMaxX = Math.max(...srcFaceOval.map(p => p.x));
      const srcMinY = Math.min(...srcFaceOval.map(p => p.y));
      const srcMaxY = Math.max(...srcFaceOval.map(p => p.y));
      const srcWidth = srcMaxX - srcMinX;
      const srcHeight = srcMaxY - srcMinY;
      
      // Create source face crop canvas
      const srcCropCanvas = document.createElement('canvas');
      srcCropCanvas.width = srcWidth * 1.2;
      srcCropCanvas.height = srcHeight * 1.2;
      const srcCropCtx = srcCropCanvas.getContext('2d');
      srcCropCtx.drawImage(sourceImg, 
        srcMinX - srcWidth * 0.1, srcMinY - srcHeight * 0.1, 
        srcWidth * 1.2, srcHeight * 1.2,
        0, 0, srcCropCanvas.width, srcCropCanvas.height
      );
      
      // Create mask from target face oval
      const tgtFaceOval = FACE_OVAL_INDICES.map(i => tgtLandmarks[i]);
      const featherWidth = tgtEyeDist * 0.07;
      
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      
      // Draw feathered polygon mask
      maskCtx.shadowBlur = featherWidth;
      maskCtx.shadowColor = 'white';
      maskCtx.fillStyle = 'white';
      maskCtx.beginPath();
      maskCtx.moveTo(tgtFaceOval[0].x, tgtFaceOval[0].y);
      tgtFaceOval.forEach(p => maskCtx.lineTo(p.x, p.y));
      maskCtx.closePath();
      maskCtx.fill();
      maskCtx.shadowBlur = 0;
      maskCtx.fill();
      
      // Draw transformed source face
      ctx.save();
      ctx.translate(tgtEyeCenter.x, tgtEyeCenter.y);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-srcEyeCenter.x, -srcEyeCenter.y);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(srcCropCanvas, srcMinX - srcWidth * 0.1, srcMinY - srcHeight * 0.1);
      ctx.restore();
      
      // Apply mask
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskCanvas, 0, 0);
      
      // Restore target background with composited face
      ctx.globalCompositeOperation = 'destination-over';
      ctx.drawImage(targetImg, 0, 0, canvas.width, canvas.height);
      
      // Debug mode: draw landmarks
      if (DEBUG_MODE) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'red';
        tgtLandmarks.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = 'lime';
        [tgtLeftEye, tgtRightEye, tgtMouth].forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      
      resolve(canvas.toDataURL('image/jpeg', 0.92));
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

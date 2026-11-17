/**
 * StarringYou - Content Script
 * Detects and swaps faces on product images
 */

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

// Perform simple face swap (overlay method)
async function performSimpleSwap(sourceFaceDataUrl, targetImageDataUrl) {
  return new Promise((resolve) => {
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

      // Simple overlay - place source face in upper center
      const faceSize = Math.min(targetImg.width, targetImg.height) * 0.25;
      const x = (targetImg.width - faceSize) / 2;
      const y = targetImg.height * 0.15;

      // Draw source face with some transparency
      ctx.globalAlpha = 0.9;
      ctx.drawImage(sourceImg, x, y, faceSize, faceSize);
      ctx.globalAlpha = 1.0;

      // Add subtle indicator
      ctx.font = '12px system-ui';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('⭐', targetImg.width - 20, 20);

      resolve(canvas.toDataURL('image/jpeg', 0.9));
    }

    sourceImg.src = sourceFaceDataUrl;
    targetImg.src = targetImageDataUrl;
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

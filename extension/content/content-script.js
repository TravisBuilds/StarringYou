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
  
  // E2E Test mode: use hardcoded test face (only if no real enrollment)
  if (TEST_MODE && !enrollmentData) {
    console.log('StarringYou: TEST MODE - using hardcoded test face');
    extensionEnabled = true;
    enrollmentData = {
      frontalFrame: HARDCODED_TEST_FACE,
      enrolledAt: Date.now()
    };
  } else if (enrollmentData) {
    console.log('StarringYou: Using enrolled face data');
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
    console.log(`StarringYou: CACHE HIT for ${img.src}`);
    applySwappedImage(img, swapCache.get(cacheKey));
    return;
  }
  
  console.log(`StarringYou: CACHE MISS for ${img.src}`);

  // Show loading indicator
  const wrapper = img.parentElement;
  const loader = document.createElement('div');
  loader.className = 'starringyou-loader';
  loader.innerHTML = '⭐ Swapping...';
  wrapper.appendChild(loader);

  try {
    // Fetch image (via background to avoid CORS)
    const imageData = await fetchImageViaBackground(originalSrc);
    
    // Select best enrolled frame based on target pose
    let selectedFrame = enrollmentData.bestFrontalFrame || { 
      dataUrl: enrollmentData.frontalFrame,
      landmarks: null,
      width: null,
      height: null
    };
    
    // If we have multiple frames with pose data, pick the best match
    if (enrollmentData.frames && Array.isArray(enrollmentData.frames)) {
      try {
        const targetFaceData = await detectFaceInImage(imageData);
        if (targetFaceData.success && targetFaceData.pose) {
          // Find frame with closest pose match
          let bestMatch = null;
          let bestScore = Infinity;
          
          enrollmentData.frames.forEach(frame => {
            if (frame.pose) {
              const yawDiff = Math.abs(frame.pose.yaw - targetFaceData.pose.yaw);
              const pitchDiff = Math.abs(frame.pose.pitch - targetFaceData.pose.pitch);
              const score = yawDiff + pitchDiff;
              
              if (score < bestScore) {
                bestScore = score;
                bestMatch = frame;
              }
            }
          });
          
          if (bestMatch) {
            console.log(`StarringYou: Using frame with yaw=${bestMatch.pose.yaw.toFixed(1)}° pitch=${bestMatch.pose.pitch.toFixed(1)}° (score=${bestScore.toFixed(1)})`);
            selectedFrame = bestMatch;
          }
        }
      } catch (e) {
        console.log('StarringYou: Could not match pose, using default frame');
      }
    }
    
    // Perform simple swap
    const swappedDataUrl = await performSimpleSwap(
      selectedFrame.dataUrl,
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

// RGB to LAB color space conversion
function rgbToLab(r, g, b) {
  // RGB to XYZ
  r = r / 255; g = g / 255; b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  
  // XYZ to LAB
  x = x / 0.95047; y = y / 1.00000; z = z / 1.08883;
  x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x + 16/116);
  y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y + 16/116);
  z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z + 16/116);
  
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

function labToRgb(l, a, b) {
  // LAB to XYZ
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;
  
  x = Math.pow(x, 3) > 0.008856 ? Math.pow(x, 3) : (x - 16/116) / 7.787;
  y = Math.pow(y, 3) > 0.008856 ? Math.pow(y, 3) : (y - 16/116) / 7.787;
  z = Math.pow(z, 3) > 0.008856 ? Math.pow(z, 3) : (z - 16/116) / 7.787;
  
  x *= 0.95047; y *= 1.00000; z *= 1.08883;
  
  // XYZ to RGB
  let r = x *  3.2406 + y * -1.5372 + z * -0.4986;
  let g = x * -0.9689 + y *  1.8758 + z *  0.0415;
  let b_ = x *  0.0557 + y * -0.2040 + z *  1.0570;
  
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1/2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1/2.4) - 0.055 : 12.92 * g;
  b_ = b_ > 0.0031308 ? 1.055 * Math.pow(b_, 1/2.4) - 0.055 : 12.92 * b_;
  
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(b_ * 255)))
  ];
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

// Inner face region for color transfer (cheeks, forehead - excluding eyes, mouth)
const INNER_FACE_INDICES = [
  // Forehead
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  // Cheeks
  123, 116, 118, 50, 101, 100, 47, 126, 217, 205, 187, 207, 
  206, 203, 142, 98, 97, 2, 326, 327, 294, 278, 439, 438, 
  371, 355, 266, 425, 423, 426, 411, 416, 434, 432, 430
];

// Perform face swap with proper landmark-based alignment
async function performSimpleSwap(sourceFaceDataUrl, targetImageDataUrl) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('SWAP_PIPELINE_V20_RUN15');
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
      
      // Create mask from target face oval, shrunk and feathered
      let tgtFaceOval = FACE_OVAL_INDICES.map(i => tgtLandmarks[i]);
      
      // Calculate centroid
      const centroid = tgtFaceOval.reduce((acc, p) => ({
        x: acc.x + p.x / tgtFaceOval.length,
        y: acc.y + p.y / tgtFaceOval.length
      }), { x: 0, y: 0 });
      
      // Shrink mask 5% toward centroid
      tgtFaceOval = tgtFaceOval.map(p => ({
        x: p.x + (centroid.x - p.x) * 0.05,
        y: p.y + (centroid.y - p.y) * 0.05
      }));
      
      // Lower top points below hairline (top ~10% of oval points)
      const topPointCount = Math.floor(tgtFaceOval.length * 0.15);
      for (let i = 0; i < topPointCount; i++) {
        tgtFaceOval[i].y += tgtEyeDist * 0.15;
      }
      
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      
      // Draw polygon mask
      maskCtx.fillStyle = 'white';
      maskCtx.beginPath();
      maskCtx.moveTo(tgtFaceOval[0].x, tgtFaceOval[0].y);
      tgtFaceOval.forEach(p => maskCtx.lineTo(p.x, p.y));
      maskCtx.closePath();
      maskCtx.fill();
      
      // Apply blur for feathering
      const blurRadius = Math.round(tgtEyeDist * 0.09);
      maskCtx.filter = `blur(${blurRadius}px)`;
      maskCtx.globalCompositeOperation = 'source-atop';
      maskCtx.drawImage(maskCanvas, 0, 0);
      maskCtx.filter = 'none';
      
      // Color transfer: RGB-based mean/std matching (more robust than LAB)
      const srcInnerFace = INNER_FACE_INDICES.map(i => srcLandmarks[i]);
      const tgtInnerFace = INNER_FACE_INDICES.map(i => tgtLandmarks[i]);
      
      // Get source and target ImageData
      const srcFaceCanvas = document.createElement('canvas');
      srcFaceCanvas.width = srcCropCanvas.width;
      srcFaceCanvas.height = srcCropCanvas.height;
      const srcFaceCtx = srcFaceCanvas.getContext('2d');
      srcFaceCtx.drawImage(srcCropCanvas, 0, 0);
      const srcData = srcFaceCtx.getImageData(0, 0, srcFaceCanvas.width, srcFaceCanvas.height);
      
      const tgtData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Sample colors from inner face regions
      const sampleColors = (imageData, landmarks, imgW, imgH, offsetX, offsetY, sampleScale) => {
        const colors = { r: [], g: [], b: [] };
        landmarks.forEach(p => {
          const x = Math.round((p.x - offsetX) * sampleScale);
          const y = Math.round((p.y - offsetY) * sampleScale);
          if (x >= 0 && x < imgW && y >= 0 && y < imgH) {
            const idx = (y * imgW + x) * 4;
            colors.r.push(imageData.data[idx]);
            colors.g.push(imageData.data[idx + 1]);
            colors.b.push(imageData.data[idx + 2]);
          }
        });
        return colors;
      };
      
      const srcSampleScale = srcFaceCanvas.width / (srcWidth * 1.2);
      const srcColors = sampleColors(srcData, srcInnerFace, srcFaceCanvas.width, srcFaceCanvas.height, 
        srcMinX - srcWidth * 0.1, srcMinY - srcHeight * 0.1, srcSampleScale);
      
      const tgtColors = sampleColors(tgtData, tgtInnerFace, canvas.width, canvas.height, 0, 0, 1);
      
      // Skip color transfer if insufficient samples
      if (srcColors.r.length > 5 && tgtColors.r.length > 5) {
        // Compute mean and std per channel
        const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
        const std = (arr, m) => Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
        
        const srcMean = { r: mean(srcColors.r), g: mean(srcColors.g), b: mean(srcColors.b) };
        const srcStd = { r: std(srcColors.r, srcMean.r), g: std(srcColors.g, srcMean.g), b: std(srcColors.b, srcMean.b) };
        const tgtMean = { r: mean(tgtColors.r), g: mean(tgtColors.g), b: mean(tgtColors.b) };
        const tgtStd = { r: std(tgtColors.r, tgtMean.r), g: std(tgtColors.g, tgtMean.g), b: std(tgtColors.b, tgtMean.b) };
        
        // Apply color transfer with strength factor
        const strength = 0.7;
        for (let i = 0; i < srcData.data.length; i += 4) {
          const r = srcData.data[i];
          const g = srcData.data[i + 1];
          const b = srcData.data[i + 2];
          
          // Transfer per channel
          let r2 = ((r - srcMean.r) / (srcStd.r + 1e-6)) * tgtStd.r + tgtMean.r;
          let g2 = ((g - srcMean.g) / (srcStd.g + 1e-6)) * tgtStd.g + tgtMean.g;
          let b2 = ((b - srcMean.b) / (srcStd.b + 1e-6)) * tgtStd.b + tgtMean.b;
          
          // Blend with original
          r2 = r + (r2 - r) * strength;
          g2 = g + (g2 - g) * strength;
          b2 = b + (b2 - b) * strength;
          
          // Clamp
          srcData.data[i] = Math.max(0, Math.min(255, Math.round(r2)));
          srcData.data[i + 1] = Math.max(0, Math.min(255, Math.round(g2)));
          srcData.data[i + 2] = Math.max(0, Math.min(255, Math.round(b2)));
        }
        srcFaceCtx.putImageData(srcData, 0, 0);
      }
      
      // Draw transformed source face with color correction
      ctx.save();
      ctx.translate(tgtEyeCenter.x, tgtEyeCenter.y);
      ctx.rotate(rotation);
      ctx.scale(scale, scale);
      ctx.translate(-srcEyeCenter.x, -srcEyeCenter.y);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(srcFaceCanvas, srcMinX - srcWidth * 0.1, srcMinY - srcHeight * 0.1);
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

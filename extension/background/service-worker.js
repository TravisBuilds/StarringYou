/**
 * StarringYou - Background Service Worker
 * Handles extension state and messaging
 */

// Extension state
let extensionEnabled = false;
let enrollmentData = null;
let offscreenDocumentReady = false;

// Create offscreen document for face detection
async function setupOffscreenDocument() {
  if (offscreenDocumentReady) return true;
  
  try {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    
    if (existingContexts.length > 0) {
      offscreenDocumentReady = true;
      console.log('Offscreen document already exists');
      return true;
    }
    
    // Create new offscreen document
    await chrome.offscreen.createDocument({
      url: 'offscreen/offscreen.html',
      reasons: ['DOM_PARSER', 'WORKERS'],
      justification: 'Face detection using MediaPipe Face Landmarker'
    });
    
    // Wait a bit for it to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    offscreenDocumentReady = true;
    console.log('Offscreen document created for face detection');
    return true;
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
    return false;
  }
}

// Listen for extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open onboarding page on first install
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/onboarding.html')
    });
  }
  
  // Initialize storage
  chrome.storage.local.get(['enabled', 'enrollmentData'], (result) => {
    extensionEnabled = result.enabled || false;
    enrollmentData = result.enrollmentData || null;
    updateBadge();
  });
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.enabled) {
      extensionEnabled = changes.enabled.newValue;
      updateBadge();
    }
    if (changes.enrollmentData) {
      enrollmentData = changes.enrollmentData.newValue;
    }
  }
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getState') {
    sendResponse({
      enabled: extensionEnabled,
      hasEnrollment: enrollmentData !== null
    });
  } else if (request.action === 'toggle') {
    extensionEnabled = !extensionEnabled;
    chrome.storage.local.set({ enabled: extensionEnabled });
    sendResponse({ enabled: extensionEnabled });
    
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'stateChanged',
          enabled: extensionEnabled
        }).catch(() => {
          // Ignore errors for tabs without content script
        });
      });
    });
  } else if (request.action === 'fetchImage') {
    // Fetch images on behalf of content script to avoid CORS issues
    fetch(request.url)
      .then(response => response.blob())
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ success: true, dataUrl: reader.result });
        };
        reader.onerror = () => {
          sendResponse({ success: false, error: 'Failed to read image' });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  } else if (request.action === 'detectFaceInImage') {
    // Forward face detection to offscreen document (pass URL directly)
    (async () => {
      try {
        const ready = await setupOffscreenDocument();
        if (!ready) {
          throw new Error('Offscreen document not available');
        }
        
        console.log('Sending detection request to offscreen document...');
        
        // Send URL directly to offscreen for detection
        const result = await chrome.runtime.sendMessage({
          action: 'detectFace',
          imageUrl: request.imageUrl
        });
        
        console.log('Detection result:', result ? 'success' : 'failed');
        sendResponse(result);
      } catch (error) {
        console.error('Face detection failed:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  return false;
});

// Update badge to show enabled/disabled state
function updateBadge() {
  const badgeText = extensionEnabled ? 'ON' : '';
  const badgeColor = extensionEnabled ? '#10b981' : '#64748b';
  
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

// Initialize badge on startup
updateBadge();

// Initialize offscreen document
setupOffscreenDocument();

console.log('StarringYou service worker initialized');

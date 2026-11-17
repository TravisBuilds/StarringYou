/**
 * StarringYou - Background Service Worker
 * Handles extension state and messaging
 */

// Extension state
let extensionEnabled = false;
let enrollmentData = null;

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

console.log('StarringYou service worker initialized');

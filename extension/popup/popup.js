/**
 * StarringYou - Popup UI Logic
 */

// UI Elements
const enrollmentText = document.getElementById('enrollment-text');
const enabledToggle = document.getElementById('enabled-toggle');
const enabledText = document.getElementById('enabled-text');
const enrollBtn = document.getElementById('enroll-btn');
const enrollBtnText = document.getElementById('enroll-btn-text');
const deleteBtn = document.getElementById('delete-btn');
const providerSelect = document.getElementById('provider-select');

// Load initial state
async function loadState() {
  // Get extension state from storage
  const result = await chrome.storage.local.get(['enabled', 'enrollmentData', 'provider']);
  
  const enabled = result.enabled || false;
  const hasEnrollment = result.enrollmentData !== null && result.enrollmentData !== undefined;
  const provider = result.provider || 'local';
  
  // Update UI
  enabledToggle.checked = enabled;
  enabledText.textContent = enabled ? 'ON' : 'OFF';
  enabledText.style.color = enabled ? '#10b981' : '#94a3b8';
  
  if (hasEnrollment) {
    enrollmentText.textContent = 'Enrolled ✓';
    enrollmentText.className = 'status-value enrolled';
    enrollBtnText.textContent = 'Re-enroll Face';
    deleteBtn.disabled = false;
  } else {
    enrollmentText.textContent = 'Not enrolled';
    enrollmentText.className = 'status-value not-enrolled';
    enrollBtnText.textContent = 'Enroll Face';
    deleteBtn.disabled = true;
  }
  
  providerSelect.value = provider;
}

// Toggle enabled state
enabledToggle.addEventListener('change', async () => {
  const enabled = enabledToggle.checked;
  
  await chrome.storage.local.set({ enabled });
  
  enabledText.textContent = enabled ? 'ON' : 'OFF';
  enabledText.style.color = enabled ? '#10b981' : '#94a3b8';
  
  // Notify background script
  chrome.runtime.sendMessage({ action: 'toggle' });
});

// Open enrollment page
enrollBtn.addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('onboarding/onboarding.html')
  });
  window.close();
});

// Delete face data
deleteBtn.addEventListener('click', async () => {
  if (confirm('Are you sure you want to delete your face data? This cannot be undone.')) {
    // Clear enrollment data and cache
    await chrome.storage.local.remove(['enrollmentData', 'swapCache']);
    
    // Clear IndexedDB
    const dbRequest = indexedDB.deleteDatabase('starringyou-db');
    dbRequest.onsuccess = () => {
      console.log('Face data deleted');
      loadState();
    };
  }
});

// Provider selection
providerSelect.addEventListener('change', async () => {
  const provider = providerSelect.value;
  await chrome.storage.local.set({ provider });
  
  if (provider !== 'local') {
    alert(`${provider} provider requires an API key. Configure it in the web app settings.`);
  }
});

// Initialize
loadState();

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    loadState();
  }
});

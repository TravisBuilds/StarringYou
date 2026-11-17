// Test setup helper - sets enrollment data for E2E testing
console.log('🧪 Test setup running');

// Check if we're in test mode (passed via URL parameter)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('test') === 'true') {
  const testData = urlParams.get('enrollmentData');
  if (testData) {
    chrome.storage.local.set({
      enrollmentData: {
        frontalFrame: testData,
        enrolledAt: Date.now()
      },
      enabled: true,
      provider: 'local'
    }, () => {
      console.log('✅ Test enrollment data set');
    });
  }
}

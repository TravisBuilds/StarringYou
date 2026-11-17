# ⭐ StarringYou

**Milestone 1:** Face enrollment and swap testing for seeing yourself in any outfit.

StarringYou is a personal project that will eventually become a Chrome extension for swapping clothing models' faces with your own on shopping sites. This milestone delivers the core enrollment flow and a test page for validating the face-swap pipeline.

---

## 🎯 What's in Milestone 1

### ✅ Completed Features

1. **Face ID-Style Enrollment Flow**
   - Webcam-based face capture with live preview
   - Guided pose detection: straight, left, right, up, down, blink
   - Auto-advance with visual progress ring (like Face ID)
   - Real-time head pose estimation using MediaPipe Face Landmarker
   - Automatic frame quality scoring (sharpness, brightness, face size, centering)

2. **Review & Export**
   - Review captured frames with quality scores
   - Download enrollment data as ZIP
   - Retake option

3. **Face Swap Test Page**
   - Select from sample clothing model images
   - See your enrolled face swapped onto the model
   - **Pluggable provider architecture:**
     - **Mock Provider** - Local crude overlay (demo only, no API)
     - **Replicate Provider** - Ready for `replicate.com` (requires API key)
     - **fal.ai Provider** - Ready for `fal.ai` (requires API key)

4. **Privacy-First Design**
   - All data stays in your browser (IndexedDB)
   - No uploads, no tracking, no analytics
   - One-click delete all face data

5. **Extension-Ready Structure**
   - Self-contained enrollment module
   - No dev-server dependencies in production build
   - MV3 CSP compatible (no inline scripts)
   - MediaPipe WASM/models loaded from CDN (can be bundled locally)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- A webcam
- (Optional) API keys for real face swap providers

### Installation

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:43123`

### Development

```bash
# Run tests
npm test

# Build for production
npm run build

# Preview production build
npm preview
```

### Test Mode (No Webcam Required)

For development and testing without a webcam, use test mode with a static image:

```bash
# Start dev server
npm run dev

# Open with test mode enabled
# Uses model-2.jpg by default
http://localhost:43123/?testMode=true

# Use a custom test image
http://localhost:43123/?testMode=true&testImage=/sample-images/model-1.jpg
```

Test mode creates a fake video stream from a still image, allowing you to:
- Test face detection and landmark extraction
- Verify MediaPipe integration works
- Demo the UI without camera access
- Sanity-check enrollment flow logic

---

## 📖 How to Use

### 1. Enroll Your Face

1. Click **"Start Enrollment"** and allow camera access
2. Follow the on-screen prompts to complete each pose:
   - Look straight ahead
   - Turn left, then right
   - Tilt up, then down
   - Blink your eyes
3. The system automatically captures the best frames when your pose is held correctly
4. Review your captures and download them as a ZIP if desired

### 2. Try a Face Swap

1. After enrollment, navigate to **"Try Swap"**
2. Select one of the sample model images
3. See your face swapped onto the model (using the selected provider)

### 3. Configure Swap Providers

Go to **Settings** to:

- **Choose a provider:**
  - **Mock (default)** - Free local demo, crude overlay
  - **Replicate** - Real face swap via Replicate API
  - **fal.ai** - Real face swap via fal.ai API

- **Add API key** (for real providers):
  - Keys are stored in memory only, never saved or committed
  - Paste your key into the settings field

---

## 🔑 Real Face Swap Providers

### Option 1: Replicate

**Cost:** ~$0.005-0.02 per image  
**Docs:** https://replicate.com/yan-ops/face_swap  
**Get API Key:** https://replicate.com/account/api-tokens

The adapter is ready to run. Just:
1. Sign up at Replicate
2. Generate an API token
3. Paste it into Settings → API Key

### Option 2: fal.ai

**Cost:** ~$0.003-0.01 per image  
**Docs:** https://fal.ai/models/fal-ai/face-swap  
**Get API Key:** https://fal.ai/dashboard/keys

The adapter is ready to run. Just:
1. Sign up at fal.ai
2. Generate an API key
3. Paste it into Settings → API Key

> **Important:** Real providers make API calls and charge per swap. Start with the mock provider to test the flow for free.

---

## 🧪 Testing

Unit tests cover frame quality scoring and pose detection logic:

```bash
npm test
```

Tests are in `src/**/*.test.ts` using Vitest.

---

## 📁 Project Structure

```
starringyou/
├── public/
│   ├── sample-images/          # Sample model images (add your own)
│   └── models/                 # (Reserved for bundled MediaPipe models)
├── src/
│   ├── enrollment/             # Self-contained enrollment module
│   │   ├── EnrollmentEngine.ts # Core enrollment state machine
│   │   └── steps.ts            # Pose step definitions
│   ├── swap/                   # Face swap functionality
│   │   ├── providers/          # Pluggable swap providers
│   │   │   ├── MockProvider.ts
│   │   │   ├── ReplicateProvider.ts
│   │   │   └── FalProvider.ts
│   │   └── ProviderManager.ts
│   ├── utils/                  # Shared utilities
│   │   ├── faceDetection.ts    # MediaPipe integration
│   │   ├── qualityScoring.ts   # Frame quality evaluation
│   │   └── storage.ts          # IndexedDB + ZIP export
│   ├── types/                  # TypeScript type definitions
│   ├── main.ts                 # App entry point
│   └── style.css               # Global styles
├── index.html                  # Main HTML
└── package.json
```

---

## 🔐 Privacy & Security

- **No uploads:** All face data stays in your browser
- **No tracking:** No analytics, no third-party scripts (except MediaPipe models)
- **Local storage:** IndexedDB for enrollment data
- **Easy deletion:** One-click "Delete My Face Data" button
- **API keys:** Never saved to disk, only stored in memory during session

---

## 🛠️ Extension Readiness

The enrollment module is structured to drop into a Chrome extension later:

- ✅ Self-contained enrollment flow
- ✅ No dev-server dependencies in production
- ✅ MV3 CSP compatible (no eval, no inline scripts)
- ✅ Modular provider architecture
- ⏳ MediaPipe models currently loaded from CDN (can bundle locally)

### Bundling MediaPipe Models Locally

To make the extension fully offline-capable:

1. Download MediaPipe WASM files and face_landmarker.task model
2. Place in `public/models/`
3. Update `faceDetection.ts` to use local paths:

```typescript
const vision = await FilesetResolver.forVisionTasks('/models/wasm');
// ...
modelAssetPath: '/models/face_landmarker.task'
```

---

## 🚧 What's Next (Future Milestones)

- **Milestone 2:** Chrome extension scaffold with content scripts
- **Milestone 3:** On-page detection and face swap on shopping sites
- **Milestone 4:** Multi-face enrollment, lighting/tone matching
- **Milestone 5:** Refinement, performance optimization, user testing

---

## 🐛 Known Limitations

- **Mock provider** is very crude (simple overlay, not a real swap)
- **Camera required** - no fallback for devices without webcam
- **Desktop Chrome optimized** - mobile support is basic
- **Single enrollment** - only one face can be enrolled at a time
- **No backend** - everything is client-side (by design for privacy)

---

## 📝 Sample Images

The repo includes placeholder sample images. Replace them with properly licensed images:

1. Download 4 clothing model images from **Unsplash** or **Pexels**
2. Save as `model-1.jpg`, `model-2.jpg`, etc. in `public/sample-images/`
3. Add attribution to `CREDITS.txt`

See `public/sample-images/DOWNLOAD_SAMPLES.md` for detailed instructions.

---

## 📄 License

This is a personal project. No license currently assigned.

---

## 🙏 Acknowledgments

- **MediaPipe** for face landmark detection
- **Unsplash** and **Pexels** for free-to-use sample images (add your own)
- **Replicate** and **fal.ai** for face swap model hosting

---

## 📧 Contact

This is a friends-and-family project. Not intended for public distribution yet.

---

**Built with:** Vite, TypeScript, MediaPipe, and privacy in mind. ⭐

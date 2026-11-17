# Testing StarringYou Milestone 1

## Quick Start Testing

### Prerequisites
- Device with a webcam (laptop, desktop with USB camera, or modern phone)
- Chrome/Chromium browser (desktop recommended for best experience)
- Node.js 18+ installed

### Setup

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

The app will be available at `http://localhost:43123`

---

## Test Checklist

### ✅ Enrollment Flow

1. **Camera Access**
   - [ ] Browser prompts for camera permission
   - [ ] Video preview appears with face guide ring
   - [ ] Denying permission shows error message

2. **Pose Detection - Straight**
   - [ ] Instruction shows "Look straight at the camera"
   - [ ] Progress indicator shows when pose is held
   - [ ] Progress ring fills as you hold the pose
   - [ ] Auto-advances after ~0.8 seconds of holding

3. **Pose Detection - Left**
   - [ ] Instruction shows "Turn your head to the left"
   - [ ] Progress responds when head turns left
   - [ ] Auto-advances when pose is held

4. **Pose Detection - Right**
   - [ ] Instruction shows "Turn your head to the right"
   - [ ] Progress responds when head turns right
   - [ ] Auto-advances when pose is held

5. **Pose Detection - Up**
   - [ ] Instruction shows "Tilt your head up slightly"
   - [ ] Progress responds when head tilts up
   - [ ] Auto-advances when pose is held

6. **Pose Detection - Down**
   - [ ] Instruction shows "Tilt your head down slightly"
   - [ ] Progress responds when head tilts down
   - [ ] Auto-advances when pose is held

7. **Blink Detection**
   - [ ] Instruction shows "Blink your eyes"
   - [ ] Progress responds when you blink
   - [ ] Auto-advances after detecting blink

8. **Review Screen**
   - [ ] Shows all captured frames in a grid
   - [ ] Each frame shows quality score (0-100)
   - [ ] Each frame labeled with step name
   - [ ] "Download as ZIP" button works
   - [ ] "Retake" button restarts enrollment
   - [ ] "Try Face Swap →" button enabled

### ✅ Face Swap Testing

1. **Sample Images**
   - [ ] Four sample placeholder images shown
   - [ ] Clicking an image starts swap process
   - [ ] Loading spinner appears

2. **Mock Provider (Default)**
   - [ ] Swap completes in 1-2 seconds
   - [ ] Shows enrolled face, target image, and swapped result side-by-side
   - [ ] Swapped result has "Mock Swap (Demo Only)" label
   - [ ] Provider info shows "Mock (Local Overlay)"

3. **Try Another Image**
   - [ ] "Try Another Image" button returns to sample selection
   - [ ] Can swap multiple times

### ✅ Settings

1. **Provider Selection**
   - [ ] Three providers listed: Mock, Replicate, fal.ai
   - [ ] Mock selected by default
   - [ ] Selecting Replicate or fal.ai shows API key field
   - [ ] API key field is password-masked
   - [ ] Cost estimates shown for each provider

2. **Privacy & Data**
   - [ ] "Delete My Face Data" button visible
   - [ ] Clicking shows confirmation dialog
   - [ ] Confirming deletes data and disables swap view
   - [ ] After deletion, must re-enroll

### ✅ Real Provider Testing (Optional)

**Only test if you have API keys and want to spend credits!**

#### Replicate Setup
1. Go to Settings
2. Select "Replicate" provider
3. Paste your Replicate API token
4. Go to "Try Swap"
5. Click a sample image
6. Wait ~10-30 seconds for real swap
7. Result should be a realistic face swap (not crude overlay)

#### fal.ai Setup
1. Go to Settings
2. Select "fal.ai" provider
3. Paste your fal.ai API key
4. Go to "Try Swap"
5. Click a sample image
6. Wait ~5-20 seconds for real swap
7. Result should be a realistic face swap

**Cost Warning:** Each real swap costs $0.003-0.02 depending on provider and model.

---

## Unit Tests

```bash
# Run all tests
npm test

# Watch mode
npm test -- --watch
```

**Test Coverage:**
- Frame quality scoring (sharpness, brightness, face size, centering)
- Quality threshold validation
- Face size calculations
- Centering calculations

---

## Known Issues & Limitations

### Expected Behavior (Not Bugs)

1. **Mock Provider is Crude**
   - The mock swap is intentionally just a simple overlay
   - It's for testing the pipeline, not realistic results
   - Use real providers (Replicate/fal.ai) for actual face swaps

2. **Pose Detection Sensitivity**
   - MediaPipe pose estimation is approximate
   - You may need to exaggerate head movements slightly
   - Works best with good lighting and clear face view

3. **Quality Scoring is Strict**
   - Some frames may not be captured if quality is too low
   - Ensure good lighting and stay centered in frame
   - Face should fill ~20-30% of the frame

4. **No Multi-Face Support**
   - Only one face can be enrolled at a time
   - Multiple faces in frame causes detection to fail
   - Re-enrollment replaces previous data

### Real Issues to Report

If you encounter these, please report:

- Camera not working after permission granted
- Pose detection never advancing
- App crashes or freezes
- Swap button not working after enrollment
- Real provider errors (check console for details)

---

## Development Testing

### Build Test

```bash
npm run build
npm run preview
```

Opens production build at `http://localhost:4173`

### Extension Readiness Check

- [ ] Build completes without errors
- [ ] No eval() or inline scripts in built code
- [ ] MediaPipe loads without CSP violations (check console)
- [ ] All features work in production build

---

## Manual Quality Checks

### Code Quality

```bash
# TypeScript check
npx tsc --noEmit

# Run tests
npm test
```

### Performance

- [ ] Enrollment completes in < 30 seconds
- [ ] Mock swap completes in < 2 seconds
- [ ] Real swap completes in < 60 seconds
- [ ] No memory leaks (check DevTools Memory tab)
- [ ] Camera stream stops when not in use

### Privacy

- [ ] No network requests except:
  - MediaPipe model loading (CDN)
  - Provider API calls (only when explicitly triggered)
- [ ] No analytics or tracking scripts
- [ ] Face data only in IndexedDB
- [ ] API keys never saved to localStorage
- [ ] Deleting data clears IndexedDB completely

---

## Testing With Sample Images

To test with real clothing model images:

1. Download 4 images from Unsplash or Pexels
2. Save as `model-1.jpg` through `model-4.jpg` in `public/sample-images/`
3. Restart dev server
4. Update `src/main.ts` to use `.jpg` instead of `.svg`

See `public/sample-images/DOWNLOAD_SAMPLES.md` for detailed instructions.

---

## Browser Compatibility

**Tested & Supported:**
- Chrome 90+ (desktop)
- Edge 90+ (desktop)

**Should Work:**
- Chrome Android (mobile - basic support)
- Safari 15+ (may have MediaPipe issues)

**Not Supported:**
- Firefox (MediaPipe GPU delegate issues)
- IE11 (modern JS features required)

---

## Reporting Issues

When reporting issues, please include:

1. Browser version (chrome://version)
2. Operating system
3. Console errors (F12 → Console tab)
4. Steps to reproduce
5. Screenshots if relevant

---

**Happy Testing! ⭐**

# StarringYou Chrome Extension

See yourself starring in any outfit! This Chrome extension lets you swap your face onto clothing model images on shopping websites.

## Installation (Friends & Family)

### Option 1: Load Unpacked (Development)

1. Download and unzip `starringyou-extension.zip`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the unzipped extension folder
6. The StarringYou icon (⭐) should appear in your toolbar

### Option 2: From Source

1. Clone or download this repository
2. Navigate to the `extension/` directory
3. Follow steps 2-5 from Option 1

## First-Time Setup

1. **Enroll Your Face** (one-time)
   - After installing, an onboarding page will open automatically
   - OR click the StarringYou icon and click "Enroll Face"
   - Allow camera access when prompted
   - Follow the on-screen instructions (look straight, left, right, up, down, blink)
   - Your face is enrolled! It stays on your device only.

2. **Enable Face Swap**
   - Click the StarringYou toolbar icon
   - Toggle "Face Swap" to ON
   - The badge will show "ON" when active

## Usage

### On Shopping Sites

Once enrolled and enabled, the extension works in two modes:

**Auto-Swap Mode (Default)**
- Visit any shopping site with clothing model images
- Large product images will automatically be swapped with your face
- Look for the small ⭐ in the corner of swapped images

**Manual Swap Mode**
- Hover over any product image
- Click the "⭐ Star me" button that appears
- Your face will be swapped onto that image

**Toggle Original / Swapped**
- Click the 🔄 badge on swapped images
- Switch between seeing your face and the original model

### Re-enrollment

To update your enrolled face:
1. Click the StarringYou icon
2. Click "Re-enroll Face"
3. Follow the enrollment flow again

### Delete Your Data

To remove all face data:
1. Click the StarringYou icon
2. Click "Delete My Face Data"
3. Confirm deletion
4. All enrolled face data and cached swaps will be erased

## Privacy & Security

✅ **Your face data stays on your device**
- Stored locally in Chrome's extension storage
- Never uploaded to any server (with Local provider)
- No analytics or tracking

✅ **You control your data**
- One-click deletion anytime
- Re-enroll whenever you want
- Extension works offline (after enrollment)

✅ **Transparent operation**
- Open source code you can inspect
- Clear indicators when swap is active
- Toggle anytime via toolbar icon

## Face Swap Providers

### Local (Free) - Default
- Runs entirely in your browser
- No API calls, no costs
- Simple overlay method (works but not perfect)
- **Privacy:** Everything stays on your device

### Replicate (~$0.005-0.02/swap)
- Professional face-swap AI model
- Requires API key from replicate.com
- Better quality than local swap
- **Privacy:** Images sent to Replicate API

### fal.ai (~$0.003-0.01/swap)
- Professional face-swap AI model
- Requires API key from fal.ai
- Better quality than local swap
- **Privacy:** Images sent to fal.ai API

**Note:** Paid providers are not configured in this version. Local provider is recommended for privacy.

## Technical Details

### Permissions Explained

- **storage** - Save your enrolled face data locally
- **activeTab** - Access product images on pages you visit
- **scripting** - Inject face-swap functionality into pages
- **host_permissions: all_urls** - Work on any shopping site

### How It Works

1. **Enrollment** - Captures your face from multiple angles using MediaPipe face detection
2. **Detection** - Scans product pages for large images (likely clothing models)
3. **Swap** - Overlays your enrolled face onto detected model images
4. **Caching** - Stores swapped images locally to avoid re-processing

### Browser Compatibility

- **Chrome 88+** (recommended)
- **Edge 88+** (Chromium-based)
- **Brave** (with some features limited)
- **Opera** (Chromium-based)

**Not supported:**
- Firefox (Manifest V3 differences)
- Safari (different extension API)

## Troubleshooting

### Extension not appearing
- Make sure Developer mode is enabled
- Try reloading the extension (chrome://extensions > reload icon)
- Check for errors in the extension console

### Camera not working
- Allow camera permissions when prompted
- Check browser camera settings
- Try a different browser if webcam isn't detected

### Face swap not working
- Make sure you're enrolled (popup should show "Enrolled ✓")
- Toggle Face Swap to ON in the popup
- Refresh the shopping page
- Check that images are large enough (>200x200px)

### Images not swapping
- Some images may be too small (icons, thumbnails)
- Dynamic images (carousels) may need manual "Star me" click
- Protected images (canvas-based) won't swap
- Try clicking "Star me" button manually

### Swap quality issues
- Local provider uses simple overlay (not realistic)
- For better quality, use paid providers (Replicate/fal.ai)
- Consider re-enrolling in better lighting

## Known Limitations

1. **Local swap is crude** - Simple overlay, not photorealistic
2. **Works best on standard product images** - Complex layouts may have issues
3. **No mobile support yet** - Desktop Chrome only
4. **Single face enrollment** - Can't have multiple people enrolled
5. **Requires good lighting** - Enrollment works best with clear, well-lit face
6. **Large images only** - Ignores small thumbnails (by design)

## Feedback & Support

This is a friends-and-family preview version. Issues and limitations are expected.

For questions or issues:
1. Check the troubleshooting section above
2. Try re-enrolling your face
3. Try disabling and re-enabling the extension

## Version History

### v0.1.0 (Current)
- Initial friends-and-family release
- Basic enrollment flow
- Simple local face swap
- Product image detection
- Auto-swap and manual modes
- Toggle original/swapped
- Local caching

## Future Improvements

- Advanced face swap algorithm (better quality)
- Multiple face enrollments (family members)
- Adjustable skin tone/lighting matching
- Settings for swap intensity
- Per-site enable/disable
- Export swapped images
- Mobile browser support

---

**Made with ⭐ for trying on clothes from home!**

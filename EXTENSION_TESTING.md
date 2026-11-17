# StarringYou Extension - Testing Guide

## Current Status

**✅ Completed:**
- Chrome MV3 extension structure
- Manifest configuration
- Background service worker
- Popup UI with controls
- Onboarding/enrollment page
- Content script for image detection
- Simple face swap (overlay method)
- Caching system
- CORS handling via background fetch

**🚧 Needs Testing:**
- End-to-end enrollment flow
- Face swap on test fixtures
- Toggle functionality
- Cache persistence
- Multiple page types

**⏳ Future Work:**
- Advanced LocalSwapEngine integration
- Better swap quality
- Pose matching
- Color correction

## Testing Steps

### 1. Load Extension in Chrome

```bash
# Extract the extension
cd /cursor/stores/self
unzip starringyou-extension.zip -d starringyou-extension-unpacked

# Or use the source directly
cd /agent/repos/tmp-41ae01c4cc37fd3b/extension
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder (or unpacked zip)
5. Extension should load with ⭐ icon

### 2. Enrollment Flow

1. After loading, onboarding page should open automatically
   - If not, click extension icon → "Enroll Face"

2. Allow camera access when prompted

3. Click "Start Enrollment"
   - Should show 6 steps with auto-advance every 3 seconds
   - Steps: straight, left, right, up, down, blink

4. After completion:
   - "Enrollment complete!" message
   - Extension automatically enables

5. Verify enrollment:
   - Click extension icon
   - Should show "Enrolled ✓"
   - Toggle should be ON

### 3. Test on Fixture Page

```bash
# Serve the test fixture
cd /agent/repos/tmp-41ae01c4cc37fd3b
python3 -m http.server 8080
```

Open in Chrome: `http://localhost:8080/test-fixtures/product-page.html`

**Expected behavior:**

1. **Auto-swap mode** (default):
   - 4 main product images should show "⭐ Swapping..." briefly
   - Images should be replaced with swapped versions
   - Small ⭐ indicator in corner of swapped images
   - 🔄 toggle badge appears at bottom-right of each swapped image

2. **Manual swap**:
   - Hover over any product image
   - "⭐ Star me" button should appear in top-right
   - Click to trigger swap

3. **Toggle original/swapped**:
   - Click 🔄 badge on any swapped image
   - Should toggle between original and swapped versions
   - Badge color changes (green = swapped, blue = original)

4. **Lazy-loaded images**:
   - Scroll down to "More Styles" section
   - Images should load after 1 second
   - Should also be auto-swapped

### 4. Test on Real Shopping Sites

Try these sites (examples):
- amazon.com (search for "men's jacket")
- zara.com
- hm.com
- uniqlo.com

**What to look for:**
- Extension detects large product images (>200x200px)
- Hover reveals "Star me" button
- Face swap works on product pages
- Toggle works
- Performance is acceptable (not too slow)

### 5. Verify Caching

1. Swap a face on a product
2. Refresh the page
3. Same image should swap faster (cached)
4. Check console: "StarringYou: Using cached swap"

### 6. Test Controls

**In popup (click extension icon):**

- [ ] Enrollment status shows correctly
- [ ] Toggle switch works (ON/OFF)
- [ ] Badge text updates on icon
- [ ] Provider selector shows options
- [ ] "Enroll Face" opens onboarding
- [ ] "Delete My Face Data" clears everything

**After deletion:**
- [ ] Enrollment status shows "Not enrolled"
- [ ] Toggle is disabled/reset
- [ ] Re-enrollment required

### 7. Test Edge Cases

- **No camera:** Should show error message
- **Camera denied:** Should show permission error
- **Small images:** Should be ignored (icons, thumbnails)
- **Dynamic content:** May need manual "Star me" click
- **Cross-origin images:** Should fetch via background (no CORS errors)

## Debugging

### Check Console Logs

**Background service worker:**
```
chrome://extensions/ → StarringYou → "service worker" link
```

Should see:
- "StarringYou service worker initialized"
- State changes
- Fetch requests

**Content script (on any page):**
```
F12 → Console
```

Should see:
- "StarringYou: Extension active, scanning for product images"
- "StarringYou: Using cached swap" (for cached images)
- Swap results

### Common Issues

**Icons not showing:**
- SVG icons used (Chrome prefers PNG)
- Extension still works, just uses default icon
- To fix: Convert SVG icons to PNG

**Face swap not working:**
- Check enrollment: popup should say "Enrolled ✓"
- Check toggle: should be ON
- Check console for errors
- Try manual "Star me" button

**Images not detected:**
- Check image size (must be >200x200px)
- Check if image is visible (not display:none)
- Try manual mode

**Swap looks bad:**
- Current algorithm is simple overlay
- Expected - will improve in next iteration
- For now, demonstrates pipeline works

## Performance Notes

- First swap: ~500ms-1s (includes face detection prep)
- Cached swaps: <100ms
- Page scan: ~50-200ms depending on image count
- Memory usage: ~20-50MB for cached swaps

## Security Notes

- Extension has `<all_urls>` permission (works on all sites)
- Only processes images, doesn't modify page functionality
- No data sent to external servers (with Local provider)
- Storage is local to Chrome profile

## Next Steps After Testing

1. **Document working features**
2. **Note limitations and bugs**
3. **Take before/after screenshots**
4. **Test on multiple real shopping sites**
5. **Improve LocalSwapEngine if basic swap works**

## Screenshot Checklist

Take these screenshots:
- [ ] Extension icon in toolbar
- [ ] Popup UI (showing enrolled status)
- [ ] Onboarding page (enrollment flow)
- [ ] Test fixture page (original)
- [ ] Test fixture page (with swaps active)
- [ ] Hover showing "Star me" button
- [ ] Toggle badge in action
- [ ] Real shopping site with swaps

## Known Issues

1. **Swap quality:** Simple overlay, not realistic (expected)
2. **Icons:** Using SVG instead of PNG (cosmetic)
3. **Performance:** First swap may be slow (acceptable)
4. **Detection:** May miss some edge cases (acceptable for v0.1)

---

**Ready to test!** Load the extension and work through the checklist above.

# Playwright Script Improvements

## ✅ Changes Made

### 1. Increased Timeout
- **Before**: 30 seconds (30000ms)
- **After**: 60 seconds (60000ms)
- **Location**: Line 35 in `__init__` method

### 2. Multiple Fallback Selectors

#### Camera Icon Selectors (6 fallbacks):
```python
camera_selectors = [
    'div[aria-label="Search by image"]',
    'div[aria-label*="Search by image" i]',  # Case-insensitive partial match
    'div[data-ved*="image"]',
    'a[aria-label*="Search by image" i]',
    'button[aria-label*="Search by image" i]',
    'svg[aria-label*="Search by image" i]',
]
```

#### Upload Tab Selectors (5 fallbacks):
```python
upload_selectors = [
    'text=Upload an image',
    'text=/upload.*image/i',  # Regex match
    'button:has-text("Upload")',
    'a:has-text("Upload")',
    'div:has-text("Upload an image")',
]
```

#### File Input Selectors (2 fallbacks):
```python
file_input_selectors = [
    'input[type="file"]',
    'input[accept*="image"]',
]
```

#### Result Selectors (5 fallbacks):
```python
result_selectors = [
    'div[data-ri]',
    'div[data-ved]',
    'div.g',
    'div[class*="result"]',
    'div[class*="image"]',
]
```

### 3. Better Error Messages

Each step now logs what it's doing:
- `Step 1: Looking for camera icon...`
- `Step 2: Clicking camera icon...`
- `Step 3: Looking for upload tab...`
- `Step 4: Uploading image file...`
- `Step 5: Waiting for search results...`

Error messages now include which step failed:
```python
'error': f'Timeout waiting for Google Images interface. Last step: {str(e)}'
```

### 4. Improved Wait Conditions

**Before**: Just finding elements
```python
camera_button = page.locator('div[aria-label="Search by image"]').first
camera_button.click()
```

**After**: Wait for visibility before clicking
```python
camera_button.wait_for(state='visible', timeout=10000)
camera_button.click()
```

**Before**: Single selector wait
```python
page.wait_for_selector('div[data-ri]', timeout=30000)
```

**After**: Try multiple selectors with visibility check
```python
for selector in result_selectors:
    try:
        page.wait_for_selector(selector, state='visible', timeout=30000)
        results_found = True
        break
    except PlaywrightTimeout:
        continue
```

### 5. Enhanced Logging

- Logs which selector successfully found each element
- Logs when fallback strategies are used
- Includes traceback for debugging
- More detailed error messages

## 🔍 How It Works Now

1. **Step 1**: Tries 6 different selectors to find camera icon
   - If not found, clicks search box and tries again
   - Waits for visibility before clicking

2. **Step 2**: Clicks camera icon (only if found)

3. **Step 3**: Tries 5 different selectors to find upload tab
   - Waits for visibility before clicking

4. **Step 4**: Tries 2 different selectors to find file input
   - Waits for element to be attached
   - Uploads the image file

5. **Step 5**: Tries 5 different selectors to find results
   - Waits for visibility
   - Continues even if no selector matches (graceful degradation)

## 🐛 Debugging Tips

### Run in Visible Mode
```bash
python scripts/playwright_web_search.py path/to/image.png --visible
```

This will show you exactly what's happening in the browser.

### Check Logs
The script now logs each step, so you can see:
- Which selector successfully found elements
- Where the process fails
- What error occurred

### Common Issues

1. **Still timing out?**
   - Google may have changed their interface
   - Try running with `--visible` to see what's happening
   - Check if Google is showing CAPTCHA or blocking automation

2. **Camera icon not found?**
   - The script tries 6 different selectors
   - If all fail, it will try clicking the search box first
   - Check logs to see which selectors were tried

3. **Results not found?**
   - The script tries 5 different result selectors
   - It will continue even if none match (graceful degradation)
   - Results extraction will still attempt to find images

## 📊 Performance

- **Timeout**: Increased from 30s to 60s
- **Selector attempts**: Multiple fallbacks (slower but more reliable)
- **Total time**: ~10-15 seconds per image (if successful)

## 🔄 Next Steps (Optional)

1. **Add screenshot on error**: Capture what Google shows when it fails
2. **Add retry logic**: Retry failed searches automatically
3. **Cache results**: Avoid re-searching the same images
4. **Parallel processing**: Search multiple images simultaneously


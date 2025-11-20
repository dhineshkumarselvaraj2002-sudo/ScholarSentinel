# Installing Tesseract OCR

Tesseract OCR is required for the OCR-based diagram search feature. Follow the instructions below for your operating system.

## Windows

### Option 1: Using Chocolatey (Recommended)

```powershell
# Install Chocolatey if you don't have it
# Then run:
choco install tesseract
```

### Option 2: Manual Installation

1. Download the installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Run the installer
3. **Important**: During installation, check "Add to PATH" or manually add Tesseract to your system PATH
4. Default installation path: `C:\Program Files\Tesseract-OCR`

### Option 3: Add to PATH Manually

If Tesseract is installed but not in PATH:

1. Find Tesseract installation (usually `C:\Program Files\Tesseract-OCR`)
2. Add to System PATH:
   - Open "Environment Variables" in Windows Settings
   - Edit "Path" variable
   - Add: `C:\Program Files\Tesseract-OCR`
3. Restart your terminal/IDE

### Verify Installation

```powershell
tesseract --version
```

## macOS

### Using Homebrew

```bash
brew install tesseract
```

### Verify Installation

```bash
tesseract --version
```

## Linux (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install tesseract-ocr
```

### Linux (Fedora/RHEL)

```bash
sudo dnf install tesseract
```

### Verify Installation

```bash
tesseract --version
```

## Python Dependencies

After installing Tesseract, install Python packages:

```bash
pip install pytesseract pillow requests
```

## Troubleshooting

### "tesseract is not installed or it's not in your PATH"

1. **Verify Tesseract is installed:**
   ```bash
   # Windows
   where tesseract
   
   # macOS/Linux
   which tesseract
   ```

2. **If not found, install Tesseract** (see instructions above)

3. **If installed but not found:**
   - Add Tesseract to your system PATH
   - Restart your terminal/IDE
   - Restart your development server

### "No module named 'pytesseract'"

```bash
pip install pytesseract
```

### "No module named 'PIL'"

```bash
pip install pillow
```

### Windows: PATH Not Working

If Tesseract is installed but Python can't find it, you can specify the path explicitly:

```python
# In your Python script or environment
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

Or set environment variable:
```powershell
$env:TESSDATA_PREFIX = "C:\Program Files\Tesseract-OCR\tessdata"
```

## Testing Installation

Test if everything works:

```python
import pytesseract
from PIL import Image

# This should print version info
print(pytesseract.get_tesseract_version())

# Test OCR on a simple image
image = Image.open('test_image.png')
text = pytesseract.image_to_string(image)
print(text)
```

## Next Steps

After installing Tesseract:

1. Restart your development server
2. Try uploading a diagram again
3. The OCR search should now work

## Alternative: Use Playwright Search

If you can't install Tesseract, you can still use the Playwright-based search (though it may hit CAPTCHA):

In `app/diagram-checker/page.tsx`, change:
```typescript
const USE_OCR_SEARCH = false  // Use Playwright instead
```



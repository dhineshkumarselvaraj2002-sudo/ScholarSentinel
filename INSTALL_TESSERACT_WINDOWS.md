# Installing Tesseract OCR on Windows (Manual Method)

Since Chocolatey is not installed, follow these manual installation steps:

## Step 1: Download Tesseract Installer

1. Go to: https://github.com/UB-Mannheim/tesseract/wiki
2. Download the latest Windows installer (`.exe` file)
   - Recommended: `tesseract-ocr-w64-setup-5.x.x.exe` (64-bit)
   - Or `tesseract-ocr-w32-setup-5.x.x.exe` (32-bit)

## Step 2: Install Tesseract

1. Run the downloaded `.exe` installer
2. **IMPORTANT**: During installation, check the box that says:
   - ✅ "Add to PATH" or
   - ✅ "Add Tesseract to system PATH"
3. Complete the installation
4. Default installation path: `C:\Program Files\Tesseract-OCR`

## Step 3: Verify Installation

Open a **new** PowerShell window (important: restart terminal) and run:

```powershell
tesseract --version
```

You should see version information like:
```
tesseract 5.3.0
 leptonica-1.82.0
  libgif 5.2.1 : libjpeg 8d (libjpeg-turbo 2.1.3) : libpng 1.6.37 : libtiff 4.4.0 : zlib 1.2.12 : libwebp 1.2.4 : libopenjp2 2.5.0
```

## Step 4: If Not in PATH (Manual Addition)

If `tesseract --version` doesn't work, manually add to PATH:

1. **Find Tesseract installation folder:**
   - Usually: `C:\Program Files\Tesseract-OCR`
   - Or check: `C:\Program Files (x86)\Tesseract-OCR`

2. **Add to System PATH:**
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Go to "Advanced" tab
   - Click "Environment Variables"
   - Under "System variables", find "Path" and click "Edit"
   - Click "New" and add: `C:\Program Files\Tesseract-OCR`
   - Click "OK" on all dialogs

3. **Restart your terminal/IDE completely**

4. **Verify again:**
   ```powershell
   tesseract --version
   ```

## Step 5: Restart Development Server

After installing Tesseract:

1. **Close your current terminal/IDE completely**
2. **Restart your development server:**
   ```powershell
   npm run dev
   ```
3. **Try uploading a diagram again**

## Alternative: Specify Tesseract Path in Code

If you can't add to PATH, you can specify the path directly in Python:

Create a file `scripts/tesseract_config.py`:

```python
import pytesseract

# Set Tesseract path (adjust if different)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
```

Then import this in `ocr_diagram_search.py` before using pytesseract.

## Troubleshooting

### "tesseract is not installed or it's not in your PATH"

- Make sure you restarted your terminal after installation
- Check if Tesseract is in PATH: `$env:Path -split ';' | Select-String -Pattern 'tesseract'`
- Try the full path: `& "C:\Program Files\Tesseract-OCR\tesseract.exe" --version`

### Still Not Working?

1. Verify Tesseract is installed:
   ```powershell
   Test-Path "C:\Program Files\Tesseract-OCR\tesseract.exe"
   ```
   Should return `True`

2. If installed but not in PATH, use the alternative method above

3. Check Python can find it:
   ```python
   import pytesseract
   print(pytesseract.pytesseract.tesseract_cmd)
   ```

## Quick Test

After installation, test with Python:

```python
import pytesseract
from PIL import Image

# This should work without errors
print(pytesseract.get_tesseract_version())
```

If this works, Tesseract is properly installed!



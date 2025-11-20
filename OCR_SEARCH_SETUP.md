# OCR-Based Diagram Search Setup

This document explains how to set up and use the OCR-based diagram search system that replaces Playwright browser automation.

## Overview

The OCR-based search system:
- ✅ **NO browser automation** - Uses free APIs only
- ✅ **NO Playwright** - Pure Python with OCR
- ✅ **Free APIs** - Serper.dev, DuckDuckGo, NoAPI.com
- ✅ **Faster** - No browser overhead
- ✅ **No CAPTCHA** - Uses legitimate search APIs

## Installation

### 1. Install Python Dependencies

```bash
pip install pytesseract pillow requests
```

### 2. Install Tesseract OCR

**Windows:**
```bash
# Download from: https://github.com/UB-Mannheim/tesseract/wiki
# Or use chocolatey:
choco install tesseract
```

**macOS:**
```bash
brew install tesseract
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install tesseract-ocr
```

### 3. Set Environment Variables (Optional)

For better search results, configure API keys:

```bash
# .env.local
SERPER_API_KEY=your_serper_api_key_here  # Get free key at https://serper.dev (100/day free)
GOOGLE_CSE_ID=your_google_cse_id  # Optional: Google Custom Search Engine
GOOGLE_API_KEY=your_google_api_key  # Optional: For Google CSE
```

**Getting Free API Keys:**

1. **Serper.dev** (Recommended - 100 free searches/day):
   - Sign up at https://serper.dev
   - Get your API key from dashboard
   - Free tier: 100 searches/day

2. **Google Custom Search Engine** (Optional):
   - Go to https://programmablesearchengine.google.com/
   - Create a new search engine
   - Get CSE ID and API key
   - Free tier: 100 searches/day

3. **DuckDuckGo** (No API key needed):
   - Already configured, no setup required
   - Free, unlimited (with rate limits)

## How It Works

### Step 1: OCR Extraction
- Extracts all readable text from the diagram using Tesseract OCR
- Returns text exactly as found (no hallucination)
- If no text found, returns `"no_ocr_text_found"`

### Step 2: Keyword Extraction
- Extracts meaningful keywords:
  - Technical terms (YOLOv5, ResNet, etc.)
  - Architecture names
  - Dataset names (MNIST, CIFAR10, etc.)
  - Dimensions (640x640, etc.)
  - Version numbers
  - Percentages

### Step 3: Query Generation
- Builds 3-5 search queries from keywords
- Examples:
  - "YOLOv5 Architecture Focus Module"
  - "ResNet Block Diagram conv2d"
  - "Convolutional Neural Network MNIST 98.7%"

### Step 4: API Search
- Uses free APIs to search:
  - **Serper.dev** (primary, if API key configured)
  - **DuckDuckGo** (fallback, no key needed)
  - **NoAPI.com** (fallback)
  - **Google CSE** (if configured)

### Step 5: Result Interpretation
- Evaluates search results for relevance
- Checks for diagram indicators:
  - GitHub repos
  - PDFs
  - Research articles
  - Academic datasets
- Calculates confidence scores based on:
  - Keyword matching
  - OCR text similarity
  - Contextual matching

### Step 6: Hash Comparison (Optional)
- Placeholder for future hash-based similarity
- Would compare dHash, pHash, wHash

## Usage

### From API

```typescript
const response = await fetch('/api/diagram/ocr-search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    imagePath: 'diagrams/extracted/image.png',
    // Optional:
    serperApiKey: 'your_key_here',
    googleCseId: 'your_cse_id_here',
  }),
})
```

### From Command Line

```bash
python scripts/ocr_diagram_search.py path/to/diagram.png

# With API keys:
python scripts/ocr_diagram_search.py path/to/diagram.png \
  --serper-key YOUR_SERPER_KEY \
  --google-cse-id YOUR_CSE_ID
```

## Output Format

```json
{
  "ocr_text": "YOLOv5 Architecture Focus Module 640x640",
  "keywords": ["YOLOv5", "Architecture", "Focus", "Module", "640x640"],
  "queries": [
    "YOLOv5 Architecture",
    "YOLOv5 Focus Module",
    "YOLOv5 640x640"
  ],
  "api_calls": [
    {
      "api": "serper",
      "method": "POST",
      "url": "https://google.serper.dev/search",
      "body": { "q": "YOLOv5 Architecture" }
    }
  ],
  "results": [
    {
      "url": "https://github.com/ultralytics/yolov5",
      "title": "YOLOv5: Architecture and Implementation",
      "reason": "Keywords matched: YOLOv5, Architecture",
      "confidence": 0.85
    }
  ],
  "hash_match": null
}
```

## Advantages Over Playwright

1. **No CAPTCHA**: Uses legitimate APIs, not browser automation
2. **Faster**: No browser startup/teardown overhead
3. **More Reliable**: APIs are more stable than web scraping
4. **Free**: Uses free APIs (Serper.dev 100/day, DuckDuckGo unlimited)
5. **No Detection**: No browser fingerprinting concerns
6. **Scalable**: Can handle more requests without IP blocking

## Limitations

1. **Requires Text**: Diagrams without readable text won't work well
2. **OCR Accuracy**: Depends on image quality and text clarity
3. **API Limits**: Free tiers have rate limits (but much higher than browser automation)
4. **No Image Matching**: Currently only matches text, not visual similarity

## Troubleshooting

### "OCR libraries not available"
```bash
pip install pytesseract pillow
# And install Tesseract OCR system package
```

### "No OCR text found"
- Check if diagram has readable text
- Try improving image quality/resolution
- Ensure text is not too small or blurry

### "No search results"
- Check API keys are configured correctly
- Verify internet connection
- Check API rate limits haven't been exceeded

### Poor OCR Results
- Preprocess images: increase contrast, resize if needed
- Ensure text is horizontal (not rotated)
- Use higher resolution images

## Migration from Playwright

The diagram checker now uses OCR search by default. To switch back to Playwright (not recommended):

```typescript
// In app/diagram-checker/page.tsx
const USE_OCR_SEARCH = false  // Change to false
// Then use /api/diagram/web-search instead
```

## Best Practices

1. **Use Serper.dev API Key**: Better results than free alternatives
2. **Preprocess Images**: Clean, high-resolution images = better OCR
3. **Monitor Rate Limits**: Track API usage to avoid hitting limits
4. **Combine with Hash Matching**: Use OCR for text-based matching, hashes for visual matching

## API Rate Limits

- **Serper.dev**: 100 searches/day (free tier)
- **DuckDuckGo**: ~1000 searches/day (unofficial limit)
- **Google CSE**: 100 searches/day (free tier)
- **NoAPI.com**: Varies

For higher volume, consider:
- Upgrading to paid API tiers
- Using multiple API keys
- Implementing request queuing


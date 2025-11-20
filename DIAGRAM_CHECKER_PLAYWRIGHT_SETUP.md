# Diagram Checker - Playwright Web Search Setup

## Overview

The Diagram Checker module now automatically:
1. Extracts diagrams from uploaded PDFs
2. Uses Playwright to search Google Images for each diagram
3. Detects if diagrams were copy-pasted from websites
4. Provides analytics on copy-paste detection

## Installation

### 1. Install Python Dependencies

```bash
pip install playwright
```

### 2. Install Playwright Browsers

After installing Playwright, you need to install the browser binaries:

```bash
playwright install chromium
```

Or install all browsers:

```bash
playwright install
```

### 3. Verify Installation

Test the Playwright script:

```bash
python scripts/playwright_web_search.py --help
```

## Usage

### Automatic Workflow

1. **Upload PDF**: Go to `/diagram-checker` and upload a PDF
2. **Automatic Extraction**: Diagrams are automatically extracted
3. **Automatic Web Search**: Each diagram is automatically searched on Google Images
4. **View Analytics**: See copy-paste detection results in the analytics card

### Manual Testing

Test the Playwright script directly:

```bash
python scripts/playwright_web_search.py path/to/image.png --engine google --visible
```

## Features

### Web Copy-Paste Detection

- **Found on Web**: Number of diagrams found on websites
- **Original**: Number of diagrams not found on web
- **Total Matches**: Total similar images found
- **Matching Pages**: Web pages containing similar images

### Visual Indicators

- **"Found on Web" Badge**: Red badge on diagrams found on websites
- **Match Count**: Shows number of similar images found
- **Matching Pages Links**: Direct links to web pages with matches
- **Search Results Link**: Link to full Google Images search results

## API Endpoint

### POST `/api/diagram/web-search`

Search for an image on the web using Playwright.

**Request Body:**
```json
{
  "imagePath": "diagrams/jobId/image.png",
  "engine": "google",
  "headless": true
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "found": true,
    "similarImages": [
      {
        "url": "https://example.com/image.jpg",
        "thumbnail": "https://example.com/thumb.jpg"
      }
    ],
    "matchingPages": [
      {
        "url": "https://example.com/page",
        "title": "Page Title"
      }
    ],
    "bestGuess": "diagram description",
    "resultUrl": "https://www.google.com/searchbyimage?image_url=...",
    "count": 5
  }
}
```

## Troubleshooting

### "playwright not installed"

```bash
pip install playwright
playwright install chromium
```

### "Browser not found"

Make sure you've run `playwright install chromium` after installing Playwright.

### Timeout Errors

If searches timeout, you can:
- Increase timeout in `scripts/playwright_web_search.py` (default: 30000ms)
- Run in visible mode to debug: `--visible` flag
- Check network connectivity

### Google Images Blocking

If Google Images blocks automated searches:
- Add delays between searches
- Use rotating user agents
- Consider using Bing Visual Search as alternative

## Configuration

### Headless Mode

By default, Playwright runs in headless mode. To see the browser:

```python
# In scripts/playwright_web_search.py
headless=False
```

Or via API:

```json
{
  "imagePath": "...",
  "headless": false
}
```

### Timeout Settings

Adjust timeout in `scripts/playwright_web_search.py`:

```python
def __init__(self, headless: bool = True, timeout: int = 30000):
    self.timeout = timeout  # milliseconds
```

## Performance

- **Search Time**: ~5-10 seconds per image
- **Concurrent Searches**: Currently sequential (one at a time)
- **Rate Limiting**: Google may rate limit if too many requests

## Notes

- Playwright requires a browser installation (Chromium, Firefox, or WebKit)
- Searches are performed sequentially to avoid rate limiting
- Results are cached in the frontend state
- Failed searches are marked with error messages


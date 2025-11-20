# Diagram Checker Enhancement - Automatic Web Search & Analytics

## ✅ What Was Implemented

### 1. Playwright-Based Web Search Script
**File**: `scripts/playwright_web_search.py`

- Uses Playwright to automate Google Images reverse search
- Supports both Google Images and Bing Visual Search
- Extracts:
  - Similar images count
  - Matching web pages
  - Best guess text
  - Search result URLs
- Handles errors gracefully with timeout protection

### 2. Web Search API Endpoint
**File**: `app/api/diagram/web-search/route.ts`

- REST API endpoint: `POST /api/diagram/web-search`
- Accepts image path, engine (google/bing), and headless mode
- Returns comprehensive search results

### 3. Enhanced Diagram Checker UI
**File**: `app/diagram-checker/page.tsx`

**New Features:**
- **Automatic Web Search**: After PDF upload and diagram extraction, automatically searches each diagram on Google Images
- **Real-time Progress**: Shows search progress (e.g., "Searching web for matches... 3/10")
- **Copy-Paste Detection**: Automatically detects if diagrams were copied from websites
- **Analytics Dashboard**: New analytics card showing:
  - Found on Web count
  - Original diagrams count
  - Total matches found
  - Matching pages count
- **Visual Indicators**: 
  - "Found on Web" badge on diagrams found online
  - Match count and matching page links
  - Direct links to search results

### 4. Updated Requirements
**File**: `python-service/requirements-forensics.txt`

- Added `playwright==1.40.0` to dependencies

## 🚀 Workflow

1. **User uploads PDF** → Diagram extraction starts
2. **Diagrams extracted** → Automatically triggers web search
3. **Web search runs** → Each diagram searched on Google Images
4. **Results displayed** → Analytics and copy-paste detection shown

## 📊 Analytics Display

The analytics card shows:
- **Found on Web**: Number of diagrams found on websites (potential copy-paste)
- **Original**: Number of diagrams not found on web
- **Total Matches**: Total similar images found across all searches
- **Matching Pages**: Total web pages containing similar images

## 🎯 Copy-Paste Detection Logic

A diagram is marked as "copied from web" if:
- Web search returns `found: true`
- AND either:
  - `count > 0` (similar images found), OR
  - `matchingPages.length > 0` (matching pages found)

## 📝 Setup Instructions

### 1. Install Playwright

```bash
pip install playwright
```

### 2. Install Browser Binaries

```bash
playwright install chromium
```

### 3. Verify Installation

```bash
python scripts/playwright_web_search.py --help
```

## 🔧 Configuration

### Headless Mode
- Default: `true` (runs browser in background)
- Change via API: `{ "headless": false }`
- Or CLI: `--visible` flag

### Timeout
- Default: 30000ms (30 seconds)
- Adjustable in `scripts/playwright_web_search.py`

## ⚠️ Important Notes

1. **Browser Installation Required**: Playwright needs Chromium installed
2. **Sequential Searches**: Searches run one at a time to avoid rate limiting
3. **Rate Limiting**: Google may rate limit if too many requests
4. **Performance**: ~5-10 seconds per image search

## 🐛 Troubleshooting

### Playwright Not Installed
```bash
pip install playwright
playwright install chromium
```

### Browser Not Found
```bash
playwright install chromium
```

### Timeout Errors
- Increase timeout in script
- Check network connectivity
- Run in visible mode to debug

## 📁 Files Created/Modified

**Created:**
- `scripts/playwright_web_search.py` - Playwright web search script
- `app/api/diagram/web-search/route.ts` - Web search API endpoint
- `DIAGRAM_CHECKER_PLAYWRIGHT_SETUP.md` - Setup documentation

**Modified:**
- `app/diagram-checker/page.tsx` - Enhanced UI with auto-search and analytics
- `python-service/requirements-forensics.txt` - Added playwright dependency

## 🎨 UI Enhancements

1. **Progress Indicator**: Shows search progress during web search
2. **Analytics Card**: Comprehensive copy-paste detection statistics
3. **Visual Badges**: "Found on Web" badges on diagrams
4. **Match Details**: Shows similar images count and matching pages
5. **Direct Links**: Links to search results and matching pages

## 🔄 Next Steps (Optional Enhancements)

1. **Batch Processing**: Process multiple images in parallel
2. **Caching**: Cache search results to avoid re-searching
3. **Bing Support**: Add Bing Visual Search as alternative
4. **Rate Limiting**: Implement smart rate limiting
5. **Export Results**: Export analytics as CSV/JSON


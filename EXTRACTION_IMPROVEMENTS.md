# Diagram Extraction Improvements - Page 2 Start & Full Page Filtering

## Changes Made

### 1. Start Extraction from Page 2
**Issue:** Extraction was starting from page 1, which often contains cover pages or title pages without diagrams.

**Solution:**
- Modified both `pdf_extractor.py` and `extract_diagrams.py` to start from page 2 (index 1)
- Changed `range(page_count)` to `range(1, page_count)`
- This skips the first page entirely

### 2. Stricter Full-Page Filtering
**Issue:** System was extracting entire pages as diagrams instead of just diagram regions.

**Solution:**
- **Area Threshold:** Reduced from 75% to 60% of page area
- **Dimension Threshold:** Reduced from 85% to 75% of page width/height
- **Edge Detection:** Added check to skip images that span edge-to-edge (likely backgrounds)
- **Position Check:** Images must have at least 5% margin from page edges

### 3. Removed Fallback Full-Image Extraction
**Issue:** When image position couldn't be determined, system was extracting the full image, which could be a full page.

**Solution:**
- Removed fallback that extracted images without position data
- Now skips images if position cannot be determined
- Only extracts images when we know their exact position on the page

### 4. Enhanced Filtering Logic

#### For Embedded Images:
- Must be < 60% of page area
- Must be < 75% of page width/height
- Must have 5% margin from edges (not edge-to-edge)
- Must be >= 100x100 pixels

#### For Drawing Regions:
- Must be < 60% of page area
- Must be < 75% of page width/height
- Must have 5% margin from edges
- Must have < 5 text blocks (not text-heavy)
- Must be >= 150x150 pixels

## Code Changes

### `pdf_extractor.py`
```python
# Start from page 2
for page_num in range(1, page_count):  # Changed from range(page_count)

# Stricter thresholds
if image_area > page_area * 0.6:  # Changed from 0.75
if image_rect.width > page_rect.width * 0.75:  # Changed from 0.85

# Edge detection
margin_threshold = 0.05  # 5% margin
if (image_rect.x0 < page_rect.width * margin_threshold and ...):
    continue  # Skip edge-to-edge images
```

### `extract_diagrams.py`
```python
# Start from page 2
for page_num in range(1, page_count):  # Changed from range(page_count)
```

## Expected Behavior

### Before:
- Extracted from page 1
- Extracted full pages as diagrams
- Extracted images without position data

### After:
- Extracts from page 2 onwards
- Only extracts diagram regions (not full pages)
- Skips images without position data
- Filters out edge-to-edge images (backgrounds)
- Uses stricter size thresholds

## Testing

Test with:
```bash
python scripts/pdf_extractor.py "path/to/pdf.pdf" --output-dir "public/diagrams"
```

Expected results:
- No extractions from page 1
- Only diagram regions extracted (not full pages)
- No empty white boxes or full-page images
- Files named like `2-diagram-1.png`, `3-1.png` (starting from page 2)


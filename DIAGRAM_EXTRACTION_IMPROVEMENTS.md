# Diagram Extraction Improvements

## Problem Fixed
**Issue:** The extraction was capturing entire pages instead of just diagram regions.

## Solution Implemented

### 1. Region-Based Extraction
- **Before:** Rendered entire pages when vector graphics were detected
- **After:** Detects and extracts only diagram regions using bounding boxes

### 2. Image Position Detection
- Uses `page.get_image_rects(xref)` to get exact image positions on pages
- Extracts only the image region, not the full page
- Filters out full-page backgrounds and large images

### 3. Smart Region Filtering
The system now filters out:
- Regions larger than 75% of page area (likely full pages)
- Regions spanning more than 85% of page width/height
- Text-heavy regions (more than 5 text blocks)
- Regions smaller than 100x100 pixels

### 4. Multiple Extraction Strategies

#### Strategy 1: Embedded Images
- Gets image positions using `get_image_rects()`
- Extracts only the image region using clipping
- Skips full-page backgrounds

#### Strategy 2: Vector Graphics
- Detects drawing regions using `get_drawings()`
- Merges nearby/overlapping regions
- Excludes text-heavy areas
- Only extracts regions that are diagram-sized

#### Strategy 3: Fallback (pdf2image)
- Only used if no diagrams found with PyMuPDF
- Note: This still extracts full pages, but only as last resort

## Key Methods

### `_get_image_rectangles(page)`
- Gets bounding rectangles for all images on page
- Returns only images >= 100x100 pixels

### `_get_drawing_regions(page)`
- Detects vector graphics regions
- Uses display list to find image insertions
- Filters by text density and size

### `_extract_region(page, page_num, region, region_idx)`
- Extracts a specific rectangular region from page
- Uses `clip` parameter to render only the region
- Saves as `{page}-diagram-{index}.png`

### `_merge_overlapping_regions(regions)`
- Merges overlapping or nearby rectangles
- Groups related diagram elements together

## Output Format

### Embedded Images
- Format: `{page}-{index}.png` (e.g., `7-1.png`)
- Extracted from image positions

### Diagram Regions
- Format: `{page}-diagram-{index}.png` (e.g., `7-diagram-1.png`)
- Extracted from detected regions

## Improvements

1. ✅ **No more full-page extractions** - Only diagram regions
2. ✅ **Better accuracy** - Uses actual image positions
3. ✅ **Smart filtering** - Excludes backgrounds and text-heavy areas
4. ✅ **Region merging** - Groups related diagram elements
5. ✅ **Size validation** - Only extracts reasonably-sized diagrams

## Testing

Test with:
```bash
python scripts/pdf_extractor.py "path/to/pdf.pdf" --output-dir "public/diagrams"
```

Expected behavior:
- Extracts only diagram regions, not full pages
- Creates files like `7-diagram-1.png` for detected regions
- Creates files like `7-1.png` for embedded images
- No files like `7-vector.png` (full page renders)

## Notes

- The system prioritizes embedded images with known positions
- Vector graphics detection is used as a supplement
- Full-page extraction is only used as a last resort fallback
- All extractions are cropped to diagram regions


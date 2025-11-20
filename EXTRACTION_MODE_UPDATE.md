# Extraction Mode Update - Embedded Images Only

## Changes Made

### Disabled Rendered Page Extraction
**User Request:** Extract only embedded images, not rendered pages.

**Solution:**
- Removed `_render_vector_diagrams()` call from `pdf_extractor.py`
- Removed `_render_page_as_image()` call from `extract_diagrams.py`
- Now extracts **only embedded images** from PDFs

### What This Means

**Before:**
- Extracted embedded images (raster images embedded in PDF)
- Also rendered pages to capture vector graphics
- Could extract full pages or large regions

**After:**
- Extracts **only embedded images** (actual image files in PDF)
- No page rendering
- No vector graphics extraction
- Only real images that are embedded in the PDF

### Extraction Behavior

1. **Starts from page 2** (skips first page)
2. **Stops at references section** (if detected)
3. **Extracts only embedded images** with known positions
4. **Crops to image regions** (not full pages)
5. **Filters out large images** (> 60% of page area)
6. **Filters out edge-to-edge images** (backgrounds)

### What Gets Extracted

✅ **Will Extract:**
- Embedded raster images (PNG, JPEG, etc.) in PDF
- Images with known positions on page
- Diagram-sized images (100x100px to 60% of page)

❌ **Will NOT Extract:**
- Rendered pages
- Vector graphics
- Full page images
- Images without position data

### Code Changes

**`pdf_extractor.py`:**
```python
# Removed:
rendered_paths = self._render_vector_diagrams(references_page)
extracted_paths.extend(rendered_paths)

# Now only:
embedded_paths = self._extract_embedded_images(references_page)
extracted_paths.extend(embedded_paths)
```

**`extract_diagrams.py`:**
```python
# Removed:
rendered_image = self._render_page_as_image(page, page_num, image_counter)
if rendered_image:
    images.append(rendered_image)

# Now only:
embedded_images = self._extract_embedded_images(...)
images.extend(embedded_images)
```

## Benefits

1. **Faster extraction** - No page rendering overhead
2. **More accurate** - Only real embedded images
3. **No false positives** - No full-page renders
4. **Cleaner results** - Only actual diagram images

## Limitations

- Will miss diagrams drawn with vector graphics (not embedded images)
- Will miss diagrams that are part of rendered text/graphics
- Only works with PDFs that have embedded image files

This is the expected behavior based on user request: **embedded images only, no rendered pages**.


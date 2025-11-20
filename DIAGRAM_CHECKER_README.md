# Diagram Checker Module

A complete module for extracting diagrams/images from PDFs, computing perceptual hashes (pHash), detecting duplicates, and preparing images for reverse image search.

## Overview

The Diagram Checker module allows you to:
- Upload PDF files and extract all embedded images and vector diagrams
- Compute perceptual hashes (pHash) for each image
- Automatically detect duplicate images
- Prepare images for manual or automated reverse image search via Google Images and Bing Visual Search

## Features

✅ **No Third-Party Paid APIs** - All processing is done locally  
✅ **Perceptual Hashing** - Uses pHash algorithm to detect similar/duplicate images  
✅ **Vector Graphics Support** - Extracts both embedded images and rendered vector diagrams  
✅ **Duplicate Detection** - Automatically identifies exact duplicates  
✅ **Reverse Search Ready** - One-click buttons for Google Images and Bing Visual Search  
✅ **Modern UI** - Built with ShadCN UI and TailwindCSS  

## Installation

### Prerequisites

1. **Python 3.8+** installed and available in PATH
2. **Node.js 18+** and npm/yarn
3. **Next.js 14+** (already part of the project)

### Python Dependencies

The required Python packages are already listed in `python-service/requirements.txt`:

```
pymupdf==1.23.8
pillow==10.1.0
imagehash==4.3.1
```

Install them using:

```bash
cd python-service
pip install -r requirements.txt
```

Or install globally:

```bash
pip install pymupdf pillow imagehash
```

### Node.js Dependencies

All required dependencies are already in `package.json`. No additional installation needed.

## Project Structure

```
ScholarSentinel/
├── app/
│   ├── api/
│   │   └── diagram/
│   │       └── upload/
│   │           └── route.ts          # API endpoint for PDF upload
│   └── diagram-checker/
│       └── page.tsx                  # Frontend UI page
├── lib/
│   └── diagram/
│       └── hash.ts                   # Hash utility functions
├── scripts/
│   └── extract_diagrams.py           # Python extraction script
└── public/
    └── diagrams/                     # Output directory for extracted images
        └── <jobId>/                  # Job-specific subdirectories
```

## Usage

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Access the Diagram Checker

Navigate to: `http://localhost:3000/diagram-checker`

### 3. Upload a PDF

1. Click "Select PDF File"
2. Choose a PDF file from your computer
3. Wait for processing (extraction and hashing)

### 4. View Results

- **Summary**: See total images, unique images, and duplicate counts
- **Duplicate Groups**: View all detected duplicate groups with their hashes
- **Image Grid**: Browse all extracted images with:
  - Image preview
  - Perceptual hash
  - Page number and dimensions
  - Duplicate flag
  - Reverse search buttons

### 5. Reverse Image Search

For each image, you can:
- **Google Images**: Click "Google" button to open the image in Google Images reverse search
- **Bing Visual Search**: Click "Bing" button to open the image in Bing Visual Search

## API Endpoint

### POST `/api/diagram/upload`

Uploads a PDF and extracts diagrams/images.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: `file` (PDF file)

**Response:**
```json
{
  "success": true,
  "jobId": "1234567890_abc123",
  "images": [
    {
      "filename": "page_1_img_1.png",
      "hash": "a1b2c3d4e5f6...",
      "path": "diagrams/1234567890_abc123/page_1_img_1.png",
      "page": 1,
      "width": 800,
      "height": 600,
      "type": "embedded",
      "is_duplicate": false
    }
  ],
  "duplicates": [
    {
      "hash": "a1b2c3d4e5f6...",
      "files": ["page_1_img_1.png", "page_5_img_1.png"],
      "count": 2
    }
  ],
  "total_images": 10,
  "unique_images": 8
}
```

## How It Works

### 1. PDF Processing

The Python script (`scripts/extract_diagrams.py`) uses **PyMuPDF (fitz)** to:
- Extract embedded images from PDF pages
- Render pages as images to capture vector graphics
- Filter out very small images (icons/decorations)

### 2. Perceptual Hashing

Each extracted image is processed with the **imagehash** library:
- Converts image to RGB format
- Computes perceptual hash (pHash) with hash_size=16
- Returns hash as string for comparison

### 3. Duplicate Detection

- Groups images by their perceptual hash
- Identifies hashes that appear multiple times
- Marks images as duplicates in the results

### 4. Image Storage

- Images are saved to `public/diagrams/<jobId>/`
- Each job gets a unique directory
- Images are accessible via public URLs for reverse search

## Extending the Module

### Automated Reverse Search with Selenium

To add automated reverse search capabilities:

1. **Install Selenium**:
   ```bash
   pip install selenium
   ```

2. **Create a new API endpoint** (`/api/diagram/reverse-search`):
   ```typescript
   // Use Selenium to automate browser interactions
   // Navigate to Google Images or Bing Visual Search
   // Upload image and extract results
   ```

3. **Add to frontend**:
   - Add "Auto Search" button
   - Call the new API endpoint
   - Display search results

### Example Selenium Integration

```python
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def automated_reverse_search(image_path: str, search_engine: str = "google"):
    """Automate reverse image search using Selenium"""
    driver = webdriver.Chrome()  # or Firefox, Edge, etc.
    
    try:
        if search_engine == "google":
            url = f"https://www.google.com/searchbyimage?image_url={image_path}"
        else:
            url = f"https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIVSP&sbisrc=UrlPaste&q=imgurl:{image_path}"
        
        driver.get(url)
        # Wait for results and extract them
        # ... (implementation details)
        
    finally:
        driver.quit()
```

### Additional Enhancements

1. **Similar Image Detection**: Use hash distance threshold to find similar (not just exact) duplicates
2. **Image Classification**: Use ML models to classify diagram types (flowchart, graph, table, etc.)
3. **OCR Integration**: Extract text from diagrams using Tesseract OCR
4. **Batch Processing**: Process multiple PDFs at once
5. **Export Options**: Export results as CSV, JSON, or PDF report

## Troubleshooting

### Python Script Not Found

**Error**: `Python script not found at: ...`

**Solution**: Ensure `scripts/extract_diagrams.py` exists and the path is correct.

### Python Not in PATH

**Error**: `Failed to spawn Python process`

**Solution**: 
- Ensure Python is installed and in your system PATH
- On Windows, you may need to use `python3` instead of `python`
- Update the API route to use the correct Python command

### Missing Python Packages

**Error**: `ModuleNotFoundError: No module named 'fitz'`

**Solution**: Install required packages:
```bash
pip install pymupdf pillow imagehash
```

### Images Not Displaying

**Error**: Images don't show in the frontend

**Solution**:
- Check that images are saved to `public/diagrams/`
- Verify the path in the API response is relative to `public/`
- Check Next.js public folder configuration

### Large PDF Processing

**Issue**: Processing takes too long or times out

**Solution**:
- Increase Next.js API route timeout
- Process PDFs in chunks
- Add progress indicators
- Consider background job processing

## Performance Notes

- **Small PDFs** (< 10 pages): Usually processes in 1-5 seconds
- **Medium PDFs** (10-50 pages): 5-30 seconds
- **Large PDFs** (> 50 pages): 30+ seconds, may need optimization

## Security Considerations

- File uploads are validated (type and size)
- Uploaded PDFs are stored in `/uploads/` (not publicly accessible)
- Extracted images are in `/public/diagrams/` (publicly accessible)
- Consider adding authentication for production use
- Implement rate limiting for API endpoints

## License

Part of the ScholarSentinel project.


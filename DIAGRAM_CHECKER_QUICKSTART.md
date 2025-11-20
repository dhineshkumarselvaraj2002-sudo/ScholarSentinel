# Diagram Checker - Quick Start Guide

## ✅ What Was Created

### 1. Python Script
- **Location**: `scripts/extract_diagrams.py`
- **Purpose**: Extracts images from PDFs, computes perceptual hashes, detects duplicates
- **Dependencies**: Already in `python-service/requirements.txt`

### 2. API Route
- **Location**: `app/api/diagram/upload/route.ts`
- **Endpoint**: `POST /api/diagram/upload`
- **Purpose**: Handles PDF uploads and calls Python script

### 3. Frontend Page
- **Location**: `app/diagram-checker/page.tsx`
- **URL**: `http://localhost:3000/diagram-checker`
- **Features**: Upload UI, image grid, duplicate detection, reverse search buttons

### 4. Utilities
- **Location**: `lib/diagram/hash.ts`
- **Purpose**: Hash comparison, URL generation for reverse search

## 🚀 Quick Start

### Step 1: Install Python Dependencies

```bash
pip install pymupdf pillow imagehash
```

Or if using the existing requirements.txt:

```bash
cd python-service
pip install -r requirements.txt
```

### Step 2: Start Development Server

```bash
npm run dev
```

### Step 3: Access the Module

Open your browser and navigate to:
```
http://localhost:3000/diagram-checker
```

### Step 4: Upload a PDF

1. Click "Select PDF File"
2. Choose a PDF file
3. Wait for processing
4. View extracted images and duplicates

## 📋 Features

- ✅ PDF upload and processing
- ✅ Image extraction (embedded + vector graphics)
- ✅ Perceptual hashing (pHash)
- ✅ Duplicate detection
- ✅ Image grid with previews
- ✅ One-click reverse search (Google Images & Bing Visual Search)
- ✅ Hash copying to clipboard

## 🔧 Troubleshooting

### "Python script not found"
- Ensure `scripts/extract_diagrams.py` exists
- Check file permissions

### "Failed to spawn Python process"
- Verify Python is in PATH: `python --version`
- On Windows, may need `python3` instead of `python`
- Update line 58 in `app/api/diagram/upload/route.ts` if needed

### "ModuleNotFoundError"
- Install dependencies: `pip install pymupdf pillow imagehash`

### Images not displaying
- Check `public/diagrams/` directory exists
- Verify images are saved correctly
- Check browser console for errors

## 📝 API Usage Example

```typescript
const formData = new FormData()
formData.append('file', pdfFile)

const response = await fetch('/api/diagram/upload', {
  method: 'POST',
  body: formData,
})

const data = await response.json()
console.log(data.images)      // Array of extracted images
console.log(data.duplicates) // Array of duplicate groups
```

## 🎯 Next Steps

1. Test with a sample PDF
2. Review extracted images
3. Use reverse search buttons to verify functionality
4. Extend with automated reverse search (see DIAGRAM_CHECKER_README.md)

## 📚 Full Documentation

See `DIAGRAM_CHECKER_README.md` for complete documentation including:
- Detailed API reference
- Extension guide (Selenium automation)
- Performance notes
- Security considerations

